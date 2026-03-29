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

class HistoricalDataFetch(BaseModel):
    timeframe: str
    start_date: datetime
    end_date: datetime

@router.post("/fetch/{symbol}")
async def fetch_historical_data(
    symbol: str,
    req: HistoricalDataFetch
):
    # Run in a thread to avoid blocking the event loop during long OKX fetches
    try:
        formatted_symbol = symbol.replace('-', '/').upper()
        result = await asyncio.to_thread(_fetch_and_save_data, formatted_symbol, req)
        return result
    except Exception as e:
        logger.error("Error in manual sync: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

def _fetch_and_save_data(formatted_symbol: str, req: HistoricalDataFetch):
    db = SessionLocal()
    try:
        start_ts = int(req.start_date.timestamp() * 1000)
        end_ts = int(req.end_date.timestamp() * 1000)

        all_ohlcv = []
        
        # Paginate forwards from start_ts using the 'since' parameter
        current_since = start_ts

        logger.info("Manual Sync: %s (%s) - Fetching forwards...", formatted_symbol, req.timeframe)

        while current_since < end_ts:
            try:
                ohlcv = exchange.fetch_ohlcv(formatted_symbol, req.timeframe, limit=100, since=current_since)
            except Exception as e:
                logger.warning("OKX fetch failed or limit reached: %s", e)
                break
            
            if not ohlcv or len(ohlcv) == 0: 
                break 
            
            valid_ohlcv = [row for row in ohlcv if row[0] >= current_since and row[0] <= end_ts]
            if not valid_ohlcv:
                break
                
            all_ohlcv.extend(valid_ohlcv)

            latest_ts = valid_ohlcv[-1][0]
            
            if latest_ts >= end_ts:
                break
                
            current_since = latest_ts + 1
            time.sleep(exchange.rateLimit / 1000)

        if not all_ohlcv:
            return {"message": "No data found for this period. (Or OKX history limit reached)."}
        
        all_ohlcv.sort(key=lambda x: x[0])

        min_ts = datetime.fromtimestamp(all_ohlcv[0][0] / 1000.0, tz=timezone.utc)
        max_ts = datetime.fromtimestamp(all_ohlcv[-1][0] / 1000.0, tz=timezone.utc)

        existing_data = db.query(Candle.timestamp).filter(
            Candle.symbol == formatted_symbol, 
            Candle.timeframe == req.timeframe,
            Candle.timestamp >= min_ts, 
            Candle.timestamp <= max_ts
        ).all()
        
        existing_times = {row[0].replace(tzinfo=timezone.utc) if row[0].tzinfo is None else row[0] for row in existing_data}

        new_candles = []
        for row in all_ohlcv:
            ts = datetime.fromtimestamp(row[0] / 1000.0, tz=timezone.utc)
            if ts not in existing_times:
                new_candles.append(Candle(
                    symbol=formatted_symbol, timeframe=req.timeframe, timestamp=ts,
                    open=row[1], high=row[2], low=row[3], close=row[4], volume=row[5], marketcap=0.0
                ))

        if new_candles:
            db.bulk_save_objects(new_candles)
            db.commit()

        return {"message": "Download complete.", "total_fetched": len(all_ohlcv), "new_saved": len(new_candles)}
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