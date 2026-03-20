import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Depends, Header, HTTPException
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
from backend.core.encryption import encrypt_data, decrypt_data

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ApexAlgo Engine API", 
    version="0.1.0",
    swagger_ui_init_oauth={"clientId": "test"} 
)

exchange = ccxt.okx({
    'hostname': 'eea.okx.com'
})

class ExchangeKeyCreate(BaseModel):
    name: str
    exchange: str = "okx"
    api_key: str
    api_secret: str
    passphrase: str
    is_sandbox: bool = True

class HistoricalDataFetch(BaseModel):
    timeframe: str
    start_date: datetime
    end_date: datetime

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
        raise HTTPException(status_code=400, detail=f"Not able to fetch the price: {str(e)}")

@app.post("/api/keys", dependencies=[Depends(verify_api_key)])
def save_exchange_keys(req: ExchangeKeyCreate, db: Session = Depends(get_db)):
    try:
        test_exchange = ccxt.okx({
            'apiKey': req.api_key,
            'secret': req.api_secret,
            'password': req.passphrase,
            'enableRateLimit': True,
            'hostname': 'eea.okx.com'
        })
        
        if req.is_sandbox:
            test_exchange.set_sandbox_mode(True)
            
        test_exchange.fetch_balance()
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OKX Connection Rejected: {str(e)}")

    try:
        enc_key = encrypt_data(req.api_key)
        enc_secret = encrypt_data(req.api_secret)
        enc_passphrase = encrypt_data(req.passphrase)

        existing = db.query(ExchangeKey).filter(ExchangeKey.name == req.name).first()

        if existing:
            existing.api_key = enc_key
            existing.api_secret = enc_secret
            existing.passphrase = enc_passphrase
            existing.is_sandbox = req.is_sandbox
            existing.exchange = req.exchange
        else:
            new_key = ExchangeKey(
                name=req.name,
                exchange=req.exchange,
                api_key=enc_key,
                api_secret=enc_secret,
                passphrase=enc_passphrase,
                is_sandbox=req.is_sandbox
            )
            db.add(new_key)

        db.commit()
        return {"message": f"Exchange key '{req.name}' verified and saved securely."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/keys", dependencies=[Depends(verify_api_key)])
def get_exchange_keys_status(db: Session = Depends(get_db)):
    keys = db.query(ExchangeKey).all()
    result = []
    
    for k in keys:
        is_active = False
        error_msg = ""
        try:
            dec_key = decrypt_data(k.api_key)
            dec_secret = decrypt_data(k.api_secret)
            dec_passphrase = decrypt_data(k.passphrase)
            
            test_exchange = ccxt.okx({
                'apiKey': dec_key,
                'secret': dec_secret,
                'password': dec_passphrase,
                'enableRateLimit': True,
                'hostname': 'eea.okx.com'
            })
            
            if k.is_sandbox:
                test_exchange.set_sandbox_mode(True)
                
            test_exchange.fetch_balance()
            is_active = True
        except Exception as e:
            is_active = False
            error_msg = str(e)
            
        result.append({
            "name": k.name,
            "exchange": k.exchange,
            "is_sandbox": k.is_sandbox,
            "is_active": is_active,
            "error_msg": error_msg
        })
        
    return result

# --- HET NIEUWE BALANCE ENDPOINT ---
@app.get("/api/keys/{key_name}/balance", dependencies=[Depends(verify_api_key)])
def get_key_balance(key_name: str, db: Session = Depends(get_db)):
    key_record = db.query(ExchangeKey).filter(ExchangeKey.name == key_name).first()
    if not key_record:
        raise HTTPException(status_code=404, detail=f"Key '{key_name}' not found.")
    
    try:
        dec_key = decrypt_data(key_record.api_key)
        dec_secret = decrypt_data(key_record.api_secret)
        dec_passphrase = decrypt_data(key_record.passphrase)
        
        test_exchange = ccxt.okx({
            'apiKey': dec_key,
            'secret': dec_secret,
            'password': dec_passphrase,
            'enableRateLimit': True,
            'hostname': 'eea.okx.com'
        })
        
        if key_record.is_sandbox:
            test_exchange.set_sandbox_mode(True)
            
        balance_data = test_exchange.fetch_balance()
        
        # Filter alleen de munten waar je daadwerkelijk saldo van hebt
        active_balances = {}
        if 'total' in balance_data:
            for coin, amount in balance_data['total'].items():
                if amount > 0:
                    active_balances[coin] = {
                        "free": balance_data['free'].get(coin, 0),
                        "used": balance_data['used'].get(coin, 0),
                        "total": amount
                    }
                    
        return {"name": key_name, "balances": active_balances}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch balance: {str(e)}")

@app.delete("/api/keys/{key_name}", dependencies=[Depends(verify_api_key)])
def delete_exchange_keys(key_name: str, db: Session = Depends(get_db)):
    try:
        key_record = db.query(ExchangeKey).filter(ExchangeKey.name == key_name).first()
        if key_record:
            db.delete(key_record)
            db.commit()
            return {"message": f"Key '{key_name}' deleted successfully."}
        raise HTTPException(status_code=404, detail=f"Key '{key_name}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/data/fetch/{symbol}", dependencies=[Depends(verify_api_key)])
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

            laatste_tijdstip = ohlcv[-1][0]
            if laatste_tijdstip >= end_ts: break
                
            current_since = laatste_tijdstip + 1
            time.sleep(exchange.rateLimit / 1000)

        if not all_ohlcv:
            return {"message": "No data found for this period."}
        
        min_ts = datetime.fromtimestamp(all_ohlcv[0][0] / 1000.0, tz=timezone.utc)
        max_ts = datetime.fromtimestamp(all_ohlcv[-1][0] / 1000.0, tz=timezone.utc)

        bestaande_data = db.query(Candle.timestamp).filter(
            Candle.symbol == formatted_symbol, 
            Candle.timeframe == req.timeframe,
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
                    timeframe=req.timeframe, 
                    timestamp=ts,
                    open=row[1], high=row[2], low=row[3], close=row[4], 
                    volume=row[5], marketcap=0.0
                ))

        if nieuwe_candles:
            db.bulk_save_objects(nieuwe_candles)
            db.commit()

        return {"message": "Download complete.", "total_fetched": len(all_ohlcv), "new_saved": len(nieuwe_candles)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/data/summary", dependencies=[Depends(verify_api_key)])
def get_data_summary(db: Session = Depends(get_db)):
    summary = db.query(
        Candle.symbol,
        Candle.timeframe,
        func.min(Candle.timestamp).label("oudste_candle"),
        func.max(Candle.timestamp).label("nieuwste_candle"),
        func.count(Candle.id).label("aantal")
    ).group_by(Candle.symbol, Candle.timeframe).all()

    return [{"symbol": r.symbol, "timeframe": r.timeframe, "oldest_candle": r.oudste_candle, "newest_candle": r.nieuwste_candle, "count": r.aantal} for r in summary]

@app.delete("/api/data", dependencies=[Depends(verify_api_key)])
def delete_data(symbol: str, timeframe: Optional[str] = None, db: Session = Depends(get_db)):
    formatted_symbol = symbol.replace('-', '/').upper()
    query = db.query(Candle).filter(Candle.symbol == formatted_symbol)
    if timeframe: query = query.filter(Candle.timeframe == timeframe)
    deleted_count = query.delete()
    db.commit()
    return {"message": f"Deleted {deleted_count} candles"}

@app.get("/api/data/candles/{symbol}", dependencies=[Depends(verify_api_key)])
def get_candles(symbol: str, x_timeframe: str = Header(...), db: Session = Depends(get_db)):
    formatted_symbol = symbol.replace('-', '/').upper()
    candles = db.query(Candle).filter(
        Candle.symbol == formatted_symbol, Candle.timeframe == x_timeframe
    ).order_by(Candle.timestamp.asc()).all()

    return [{"time": int(c.timestamp.replace(tzinfo=timezone.utc).timestamp()), "open": c.open, "high": c.high, "low": c.low, "close": c.close, "value": c.volume} for c in candles]