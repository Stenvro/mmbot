import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Depends, Header
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
import ccxt

from backend.core.database import engine, Base, get_db
from backend.models.positions import Position
from backend.models.orders import Order
from backend.models.candles import Candle
from backend.models.signals import Signal
from backend.models.preferences import Preference
from backend.models.exchange_keys import ExchangeKey
from backend.core.security import verify_api_key, api_key_header
from backend.core.encryption import encrypt_data

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ApexAlgo Engine API", 
    version="0.1.0",
    swagger_ui_init_oauth={"clientId": "test"} 
)

exchange = ccxt.okx()

class ExchangeKeyCreate(BaseModel):
    exchange: str = "okx"
    api_key: str
    api_secret: str
    passphrase: str
    is_sandbox: bool = True

@app.get("/", dependencies=[Depends(verify_api_key)])
def read_root():
    return {"status": "online", "message": "ApexAlgo Engine Healthy!"}

@app.get("/api/price/{symbol}", dependencies=[Depends(verify_api_key)])
def get_price(symbol: str):
    try:
        formatted_symbol = symbol.replace('-', '/').upper()
        ticker = exchange.fetch_ticker(formatted_symbol)
        
        return {
            "exchange": "OKX",
            "symbol": formatted_symbol,
            "price": ticker['last'],
            "timestamp": ticker['datetime']
        }
    except Exception as e:
        return {"error": f"Not able to fetch the price: {str(e)}"}

@app.post("/api/keys", dependencies=[Depends(verify_api_key)])
def save_exchange_keys(req: ExchangeKeyCreate, db: Session = Depends(get_db)):
    try:
        enc_key = encrypt_data(req.api_key)
        enc_secret = encrypt_data(req.api_secret)
        enc_passphrase = encrypt_data(req.passphrase)

        existing = db.query(ExchangeKey).filter(ExchangeKey.exchange == req.exchange).first()

        if existing:
            existing.api_key = enc_key
            existing.api_secret = enc_secret
            existing.passphrase = enc_passphrase
            existing.is_sandbox = req.is_sandbox
        else:
            new_key = ExchangeKey(
                exchange=req.exchange,
                api_key=enc_key,
                api_secret=enc_secret,
                passphrase=enc_passphrase,
                is_sandbox=req.is_sandbox
            )
            db.add(new_key)

        db.commit()
        return {"message": "Exchange keys securely encrypted and saved."}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/keys", dependencies=[Depends(verify_api_key)])
def get_exchange_keys_status(db: Session = Depends(get_db)):
    keys = db.query(ExchangeKey).all()
    return [
        {
            "exchange": k.exchange,
            "is_sandbox": k.is_sandbox,
            "is_configured": True
        }
        for k in keys
    ]

@app.delete("/api/keys", dependencies=[Depends(verify_api_key)])
def delete_exchange_keys(exchange_name: str = "okx", db: Session = Depends(get_db)):
    try:
        key_record = db.query(ExchangeKey).filter(ExchangeKey.exchange == exchange_name).first()
        if key_record:
            db.delete(key_record)
            db.commit()
            return {"message": f"Keys for {exchange_name} deleted successfully."}
        return {"message": f"No keys found for {exchange_name}."}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/data/fetch/{symbol}", dependencies=[Depends(verify_api_key)])
def fetch_historical_data(
    symbol: str,
    x_timeframe: str = Header(...),
    x_start_date: datetime = Header(...),
    x_end_date: datetime = Header(...),
    db: Session = Depends(get_db)
):
    try:
        formatted_symbol = symbol.replace('-', '/').upper()
        
        start_ts = int(x_start_date.timestamp() * 1000)
        end_ts = int(x_end_date.timestamp() * 1000)

        all_ohlcv = []
        current_since = start_ts

        while current_since < end_ts:
            ohlcv = exchange.fetch_ohlcv(formatted_symbol, x_timeframe, since=current_since, limit=100)

            if not ohlcv:
                break 
            
            valid_ohlcv = [row for row in ohlcv if row[0] <= end_ts]
            all_ohlcv.extend(valid_ohlcv)

            laatste_tijdstip = ohlcv[-1][0]
            
            if laatste_tijdstip >= end_ts:
                break
                
            current_since = laatste_tijdstip + 1
            
            time.sleep(exchange.rateLimit / 1000)

        if not all_ohlcv:
            return {"message": "No data found for this period."}
        
        min_ts = datetime.fromtimestamp(all_ohlcv[0][0] / 1000.0, tz=timezone.utc)
        max_ts = datetime.fromtimestamp(all_ohlcv[-1][0] / 1000.0, tz=timezone.utc)

        bestaande_data = db.query(Candle.timestamp).filter(
            Candle.symbol == formatted_symbol, 
            Candle.timeframe == x_timeframe,
            Candle.timestamp >= min_ts, 
            Candle.timestamp <= max_ts
        ).all()
        
        bestaande_tijden = {rij[0].replace(tzinfo=timezone.utc) for rij in bestaande_data if rij[0]}

        nieuwe_candles = []
        for row in all_ohlcv:
            ts = datetime.fromtimestamp(row[0] / 1000.0, tz=timezone.utc)
            if ts not in bestaande_tijden:
                nieuwe_candles.append(Candle(
                    symbol=formatted_symbol, 
                    timeframe=x_timeframe, 
                    timestamp=ts,
                    open=row[1], 
                    high=row[2], 
                    low=row[3], 
                    close=row[4], 
                    volume=row[5], 
                    marketcap=0.0
                ))

        if nieuwe_candles:
            db.bulk_save_objects(nieuwe_candles)
            db.commit()

        return {
            "message": "Download complete.",
            "total_fetched": len(all_ohlcv),
            "new_saved": len(nieuwe_candles)
        }

    except Exception as e:
        return {"error": f"Error during fetch or save: {str(e)}"}

@app.get("/api/data/summary", dependencies=[Depends(verify_api_key)])
def get_data_summary(db: Session = Depends(get_db)):
    summary = db.query(
        Candle.symbol,
        Candle.timeframe,
        func.min(Candle.timestamp).label("oudste_candle"),
        func.max(Candle.timestamp).label("nieuwste_candle"),
        func.count(Candle.id).label("aantal")
    ).group_by(Candle.symbol, Candle.timeframe).all()

    return [
        {
            "symbol": row.symbol,
            "timeframe": row.timeframe,
            "oldest_candle": row.oudste_candle,
            "newest_candle": row.nieuwste_candle,
            "count": row.aantal
        }
        for row in summary
    ]

@app.delete("/api/data", dependencies=[Depends(verify_api_key)])
def delete_data(symbol: str, timeframe: Optional[str] = None, db: Session = Depends(get_db)):
    formatted_symbol = symbol.replace('-', '/').upper()
    
    query = db.query(Candle).filter(Candle.symbol == formatted_symbol)
    
    if timeframe:
        query = query.filter(Candle.timeframe == timeframe)
        
    deleted_count = query.delete()
    db.commit()
    
    message = f"Deleted {deleted_count} candles for {formatted_symbol}"
    if timeframe:
        message += f" (interval {timeframe} only)."
    else:
        message += " (all data for this pair erased)."
        
    return {"message": message}

@app.get("/api/data/candles/{symbol}", dependencies=[Depends(verify_api_key)])
def get_candles(
    symbol: str, 
    x_timeframe: str = Header(...), 
    db: Session = Depends(get_db)
):
    formatted_symbol = symbol.replace('-', '/').upper()
    
    candles = db.query(Candle).filter(
        Candle.symbol == formatted_symbol,
        Candle.timeframe == x_timeframe
    ).order_by(Candle.timestamp.asc()).all()

    return [
        {
            "time": int(candle.timestamp.replace(tzinfo=timezone.utc).timestamp()), 
            "open": candle.open,
            "high": candle.high,
            "low": candle.low,
            "close": candle.close,
            "value": candle.volume
        }
        for candle in candles
    ]