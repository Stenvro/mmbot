import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
import ccxt

from backend.core.database import get_db
from backend.models.candles import Candle
from backend.core.security import verify_api_key

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
def fetch_historical_data(
    symbol: str,
    req: HistoricalDataFetch,
    db: Session = Depends(get_db)
):
    try:
        formatted_symbol = symbol.replace('-', '/').upper()
        start_ts = int(req.start_date.timestamp() * 1000)
        end_ts = int(req.end_date.timestamp() * 1000)

        all_ohlcv = []
        current_since = start_ts

        while current_since < end_ts:
            ohlcv = exchange.fetch_ohlcv(formatted_symbol, req.timeframe, since=current_since, limit=100)
            if not ohlcv: break 
            
            valid_ohlcv = [row for row in ohlcv if row[0] <= end_ts]
            all_ohlcv.extend(valid_ohlcv)

            last_ts = ohlcv[-1][0]
            if last_ts >= end_ts: break
                
            current_since = last_ts + 1
            time.sleep(exchange.rateLimit / 1000)

        if not all_ohlcv:
            return {"message": "No data found for this period."}
        
        min_ts = datetime.fromtimestamp(all_ohlcv[0][0] / 1000.0, tz=timezone.utc)
        max_ts = datetime.fromtimestamp(all_ohlcv[-1][0] / 1000.0, tz=timezone.utc)

        existing_data = db.query(Candle.timestamp).filter(
            Candle.symbol == formatted_symbol, 
            Candle.timeframe == req.timeframe,
            Candle.timestamp >= min_ts, 
            Candle.timestamp <= max_ts
        ).all()
        
        existing_times = {row[0].replace(tzinfo=timezone.utc) for row in existing_data if row[0]}

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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
def delete_data(symbol: str, timeframe: Optional[str] = None, db: Session = Depends(get_db)):
    formatted_symbol = symbol.replace('-', '/').upper()
    query = db.query(Candle).filter(Candle.symbol == formatted_symbol)
    if timeframe: query = query.filter(Candle.timeframe == timeframe)
    deleted_count = query.delete()
    db.commit()
    return {"message": f"Deleted {deleted_count} candles"}

@router.get("/candles/{symbol}")
def get_candles(symbol: str, x_timeframe: str = Header(...), db: Session = Depends(get_db)):
    formatted_symbol = symbol.replace('-', '/').upper()
    candles = db.query(Candle).filter(
        Candle.symbol == formatted_symbol, Candle.timeframe == x_timeframe
    ).order_by(Candle.timestamp.asc()).all()

    return [{"time": int(c.timestamp.replace(tzinfo=timezone.utc).timestamp()), "open": c.open, "high": c.high, "low": c.low, "close": c.close, "value": c.volume} for c in candles]