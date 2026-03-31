import logging
import time
from datetime import datetime, timezone
from typing import Optional
import asyncio

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
import ccxt

from backend.core.database import get_db, SessionLocal
from backend.models.candles import Candle
from backend.core.security import verify_api_key

logger = logging.getLogger("apexalgo.data")

router = APIRouter(
    prefix="/api/data",
    tags=["Market Data"],
    dependencies=[Depends(verify_api_key)]
)

exchange = ccxt.okx({'hostname': 'eea.okx.com'})

BAR_MAP = {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
    '1d': '1D', '1w': '1W',
}

class HistoricalDataFetch(BaseModel):
    timeframe: str
    start_date: datetime
    end_date: datetime

@router.post("/fetch/{symbol}")
async def fetch_historical_data(
    symbol: str,
    req: HistoricalDataFetch
):
    bar = BAR_MAP.get(req.timeframe.lower())
    if not bar:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe '{req.timeframe}'. Supported: {', '.join(BAR_MAP)}")
    try:
        formatted_symbol = symbol.replace('-', '/').upper()
        inst_id = formatted_symbol.replace('/', '-')
        result = await asyncio.to_thread(_fetch_and_save_data, formatted_symbol, inst_id, bar, req)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in manual sync: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

def _fetch_and_save_data(formatted_symbol: str, inst_id: str, bar: str, req: HistoricalDataFetch):
    db = SessionLocal()
    try:
        start_ts = int(req.start_date.timestamp() * 1000)
        end_ts = int(req.end_date.timestamp() * 1000)

        total_fetched = 0
        total_saved = 0
        actual_oldest_ts = None

        # Paginate backwards from end_ts using the OKX history endpoint.
        # This endpoint goes further back than fetch_ohlcv (which only covers ~1440 recent candles).
        # Pagination: 'after' returns candles with timestamp < after value.
        current_end = end_ts

        logger.info("Manual sync: %s (%s) - fetching backwards from %s...", formatted_symbol, bar, req.end_date)

        while True:
            try:
                res = exchange.publicGetMarketHistoryCandles({
                    'instId': inst_id,
                    'bar': bar,
                    'after': str(current_end),
                    'limit': '100',
                })
            except Exception as e:
                logger.warning("OKX fetch error for %s: %s", formatted_symbol, e)
                break

            if not res or 'data' not in res or not res['data']:
                logger.info("OKX history limit reached for %s at cursor %s.", formatted_symbol, current_end)
                break

            batch = res['data']

            # Filter: only keep candles within [start_ts, end_ts]
            valid = [row for row in batch if int(row[0]) >= start_ts and int(row[0]) <= end_ts]

            if valid:
                total_fetched += len(valid)

                batch_start_dt = datetime.fromtimestamp(int(valid[-1][0]) / 1000.0, tz=timezone.utc)
                batch_end_dt = datetime.fromtimestamp(int(valid[0][0]) / 1000.0, tz=timezone.utc)

                existing = db.query(Candle.timestamp).filter(
                    Candle.symbol == formatted_symbol,
                    Candle.timeframe == req.timeframe,
                    Candle.timestamp >= batch_start_dt,
                    Candle.timestamp <= batch_end_dt,
                ).all()
                existing_times = {r[0].replace(tzinfo=timezone.utc) if r[0].tzinfo is None else r[0] for r in existing}

                new_candles = []
                for row in valid:
                    ts = datetime.fromtimestamp(int(row[0]) / 1000.0, tz=timezone.utc)
                    if ts not in existing_times:
                        new_candles.append(Candle(
                            symbol=formatted_symbol, timeframe=req.timeframe, timestamp=ts,
                            open=float(row[1]), high=float(row[2]), low=float(row[3]),
                            close=float(row[4]), volume=float(row[5]), marketcap=0.0
                        ))

                if new_candles:
                    db.bulk_save_objects(new_candles)
                    db.commit()
                    total_saved += len(new_candles)

                actual_oldest_ts = int(batch[-1][0])

            # Move cursor to oldest candle in this batch (regardless of filter)
            oldest_in_batch = int(batch[-1][0])
            if oldest_in_batch <= start_ts:
                break

            current_end = oldest_in_batch
            time.sleep(0.2)

        if total_fetched == 0:
            return {"message": "OKX has no data available for this symbol/timeframe in the requested range.", "total_fetched": 0, "new_saved": 0}

        actual_start_str = None
        if actual_oldest_ts:
            actual_start_dt = datetime.fromtimestamp(actual_oldest_ts / 1000.0, tz=timezone.utc)
            actual_start_str = actual_start_dt.isoformat()
            if actual_oldest_ts > start_ts:
                msg = f"Download complete. OKX history only goes back to {actual_start_dt.strftime('%Y-%m-%d')} for this pair/interval."
            else:
                msg = "Download complete."
        else:
            msg = "Download complete."

        return {
            "message": msg,
            "total_fetched": total_fetched,
            "new_saved": total_saved,
            "actual_start": actual_start_str,
        }
    finally:
        db.close()

@router.get("/summary")
def get_data_summary(db: Session = Depends(get_db)):
    summary = db.query(
        Candle.symbol,
        Candle.timeframe,
        func.min(Candle.timestamp).label("oldest_candle"),
        func.max(Candle.timestamp).label("newest_candle"),
        func.count(Candle.id).label("count")
    ).group_by(Candle.symbol, Candle.timeframe).all()

    return [{"symbol": r.symbol, "timeframe": r.timeframe, "oldest_candle": r.oldest_candle, "newest_candle": r.newest_candle, "count": r.count} for r in summary]

@router.delete("")
def delete_data(symbol: str, timeframe: Optional[str] = None, before_date: Optional[str] = None, db: Session = Depends(get_db)):
    formatted_symbol = symbol.replace('-', '/').upper()
    query = db.query(Candle).filter(Candle.symbol == formatted_symbol)
    
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
def get_candles(symbol: str, limit: Optional[int] = None, x_timeframe: str = Header(...), db: Session = Depends(get_db)):
    formatted_symbol = symbol.replace('-', '/').upper()
    query = db.query(Candle).filter(Candle.symbol == formatted_symbol, Candle.timeframe == x_timeframe).order_by(Candle.timestamp.desc())
    if limit: query = query.limit(limit)
    candles = query.all()
    candles.reverse()
    return [{"time": int(c.timestamp.replace(tzinfo=timezone.utc).timestamp()), "open": c.open, "high": c.high, "low": c.low, "close": c.close, "value": c.volume} for c in candles]

@router.get("/market-info/{symbol}")
def get_market_info(symbol: str):
    try:
        formatted_symbol = symbol.replace('-', '/').upper()
        ticker = exchange.fetch_ticker(formatted_symbol)
        return {
            "symbol": formatted_symbol,
            "last": ticker.get('last', 0),
            "change_24h": ticker.get('percentage', 0),
            "high_24h": ticker.get('high', 0),
            "low_24h": ticker.get('low', 0),
            "vol_24h": ticker.get('baseVolume', 0)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch market info: {str(e)}")