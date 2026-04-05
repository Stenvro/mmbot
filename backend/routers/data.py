import logging
import time
from datetime import datetime, timezone
from typing import Optional
import asyncio

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.core.database import get_db, SessionLocal
from backend.models.candles import Candle
from backend.core.security import verify_api_key
from backend.core.exchange_registry import build_exchange, SUPPORTED_EXCHANGES

logger = logging.getLogger("apexalgo.data")

router = APIRouter(
    prefix="/api/data",
    tags=["Market Data"],
    dependencies=[Depends(verify_api_key)]
)


class HistoricalDataFetch(BaseModel):
    exchange: str = "okx"
    timeframe: str
    start_date: datetime
    end_date: datetime


@router.post("/fetch/{symbol}")
async def fetch_historical_data(
    symbol: str,
    req: HistoricalDataFetch
):
    exchange_id = req.exchange.lower()
    if exchange_id not in SUPPORTED_EXCHANGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported exchange '{exchange_id}'. Supported: {', '.join(SUPPORTED_EXCHANGES)}"
        )
    if not req.timeframe:
        raise HTTPException(status_code=400, detail="timeframe is required.")
    try:
        formatted_symbol = symbol.replace('-', '/').upper()
        result = await asyncio.to_thread(_fetch_and_save_data, formatted_symbol, exchange_id, req)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in manual sync: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


def _fetch_and_save_data(formatted_symbol: str, exchange_id: str, req: HistoricalDataFetch):
    exch = build_exchange(exchange_id)

    try:
        tf_seconds = exch.parse_timeframe(req.timeframe)
    except Exception:
        tf_seconds = 60

    start_ts = int(req.start_date.timestamp() * 1000)
    end_ts = int(req.end_date.timestamp() * 1000)

    current_since = start_ts
    total_fetched = 0
    total_saved = 0
    actual_oldest_ts = None
    actual_newest_ts = None

    logger.info(
        "Manual sync: %s/%s/%s — fetching from %s to %s.",
        exchange_id, formatted_symbol, req.timeframe, req.start_date, req.end_date
    )

    db = SessionLocal()
    try:
        while current_since < end_ts:
            try:
                batch = exch.fetch_ohlcv(
                    formatted_symbol, req.timeframe, since=current_since, limit=500
                )
            except Exception as e:
                logger.warning("Fetch error %s/%s/%s: %s", exchange_id, formatted_symbol, req.timeframe, e)
                break

            if not batch:
                break

            # Filter to requested date range
            valid = [c for c in batch if start_ts <= int(c[0]) <= end_ts]

            if valid:
                total_fetched += len(valid)

                batch_start_dt = datetime.fromtimestamp(int(valid[0][0]) / 1000.0, tz=timezone.utc)
                batch_end_dt = datetime.fromtimestamp(int(valid[-1][0]) / 1000.0, tz=timezone.utc)

                existing = db.query(Candle.timestamp).filter(
                    Candle.exchange == exchange_id,
                    Candle.symbol == formatted_symbol,
                    Candle.timeframe == req.timeframe,
                    Candle.timestamp >= batch_start_dt,
                    Candle.timestamp <= batch_end_dt,
                ).all()
                existing_times = {
                    r[0].replace(tzinfo=timezone.utc) if r[0].tzinfo is None else r[0]
                    for r in existing
                }

                new_candles = []
                for row in valid:
                    ts = datetime.fromtimestamp(int(row[0]) / 1000.0, tz=timezone.utc)
                    if ts not in existing_times:
                        new_candles.append(Candle(
                            exchange=exchange_id,
                            symbol=formatted_symbol,
                            timeframe=req.timeframe,
                            timestamp=ts,
                            open=float(row[1]),
                            high=float(row[2]),
                            low=float(row[3]),
                            close=float(row[4]),
                            volume=float(row[5]),
                            marketcap=0.0,
                        ))

                if new_candles:
                    db.bulk_save_objects(new_candles)
                    db.commit()
                    total_saved += len(new_candles)

                if actual_oldest_ts is None:
                    actual_oldest_ts = int(valid[0][0])
                actual_newest_ts = int(valid[-1][0])

            last_ts = int(batch[-1][0])

            # Stop if exchange returned data beyond our range or returned a short batch
            if last_ts >= end_ts or len(batch) < 2:
                break

            current_since = last_ts + 1
            time.sleep(0.2)

        if total_fetched == 0:
            return {
                "message": f"{SUPPORTED_EXCHANGES[exchange_id]} has no data available for this symbol/timeframe in the requested range.",
                "total_fetched": 0,
                "new_saved": 0,
            }

        msg = "Download complete."
        if actual_oldest_ts and actual_oldest_ts > start_ts:
            actual_start_dt = datetime.fromtimestamp(actual_oldest_ts / 1000.0, tz=timezone.utc)
            msg = f"Download complete. {SUPPORTED_EXCHANGES[exchange_id]} history only goes back to {actual_start_dt.strftime('%Y-%m-%d')} for this pair/interval."

        return {
            "message": msg,
            "total_fetched": total_fetched,
            "new_saved": total_saved,
            "actual_start": datetime.fromtimestamp(actual_oldest_ts / 1000.0, tz=timezone.utc).isoformat() if actual_oldest_ts else None,
        }
    finally:
        db.close()


@router.get("/exchanges")
def get_supported_exchanges():
    """Return the list of supported exchanges for UI dropdowns."""
    return [{"id": k, "name": v} for k, v in SUPPORTED_EXCHANGES.items()]


@router.get("/summary")
def get_data_summary(db: Session = Depends(get_db)):
    summary = db.query(
        Candle.exchange,
        Candle.symbol,
        Candle.timeframe,
        func.min(Candle.timestamp).label("oldest_candle"),
        func.max(Candle.timestamp).label("newest_candle"),
        func.count(Candle.id).label("count")
    ).group_by(Candle.exchange, Candle.symbol, Candle.timeframe).all()

    return [
        {
            "exchange": r.exchange,
            "symbol": r.symbol,
            "timeframe": r.timeframe,
            "oldest_candle": r.oldest_candle,
            "newest_candle": r.newest_candle,
            "count": r.count,
        }
        for r in summary
    ]


@router.delete("")
def delete_data(
    symbol: str,
    exchange: Optional[str] = None,
    timeframe: Optional[str] = None,
    before_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    formatted_symbol = symbol.replace('-', '/').upper()
    query = db.query(Candle).filter(Candle.symbol == formatted_symbol)

    if exchange:
        query = query.filter(Candle.exchange == exchange.lower())
    if timeframe:
        query = query.filter(Candle.timeframe == timeframe)
    if before_date:
        try:
            date_limit = datetime.fromisoformat(before_date.replace('Z', '+00:00'))
            query = query.filter(Candle.timestamp < date_limit)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

    deleted_count = query.delete()
    db.commit()
    return {"message": f"Deleted {deleted_count} historical candles."}


@router.get("/candles/{symbol}")
def get_candles(
    symbol: str,
    limit: Optional[int] = Query(default=None, le=100000),
    exchange: Optional[str] = None,
    x_timeframe: str = Header(...),
    db: Session = Depends(get_db)
):
    formatted_symbol = symbol.replace('-', '/').upper()
    query = db.query(Candle).filter(
        Candle.symbol == formatted_symbol,
        Candle.timeframe == x_timeframe,
    )
    if exchange:
        query = query.filter(Candle.exchange == exchange.lower())
    query = query.order_by(Candle.timestamp.desc())
    if limit:
        query = query.limit(limit)
    candles = query.all()
    candles.reverse()
    return [
        {
            "time": int(c.timestamp.replace(tzinfo=timezone.utc).timestamp()),
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "value": c.volume,
        }
        for c in candles
    ]


@router.get("/market-info/{symbol}")
def get_market_info(symbol: str, exchange: str = "okx"):
    try:
        exchange_id = exchange.lower()
        exch = build_exchange(exchange_id)
        formatted_symbol = symbol.replace('-', '/').upper()
        ticker = exch.fetch_ticker(formatted_symbol)
        return {
            "symbol": formatted_symbol,
            "last": ticker.get('last', 0),
            "change_24h": ticker.get('percentage', 0),
            "high_24h": ticker.get('high', 0),
            "low_24h": ticker.get('low', 0),
            "vol_24h": ticker.get('baseVolume', 0),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch market info: {str(e)}")
