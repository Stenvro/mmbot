from fastapi import FastAPI, Depends, HTTPException
import ccxt

from backend.core.database import engine, Base
from backend.core.security import verify_api_key

# FIX: Ensure SQLAlchemy knows about all models and relationships 
# before calling Base.metadata.create_all()
from backend.models.positions import Position
from backend.models.orders import Order
from backend.models.candles import Candle
from backend.models.signals import Signal
from backend.models.preferences import Preference
from backend.models.exchange_keys import ExchangeKey

# Import the routers
from backend.routers import keys, data

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ApexAlgo Engine API", 
    version="0.1.0",
    swagger_ui_init_oauth={"clientId": "test"} 
)

# Connect routers to the main application
app.include_router(keys.router)
app.include_router(data.router)

exchange = ccxt.okx({'hostname': 'eea.okx.com'})

@app.get("/", dependencies=[Depends(verify_api_key)])
def read_root():
    return {"status": "online", "message": "ApexAlgo Engine is running and modularized!"}

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