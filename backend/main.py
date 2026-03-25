from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import ccxt
import asyncio
from contextlib import asynccontextmanager

from backend.core.database import engine, Base
from backend.core.security import verify_api_key

# Ensure SQLAlchemy knows about all models before calling create_all()
from backend.models.positions import Position
from backend.models.orders import Order
from backend.models.candles import Candle
from backend.models.signals import Signal
from backend.models.preferences import Preference
from backend.models.exchange_keys import ExchangeKey
from backend.models.bots import BotConfig  

# Import the routers
from backend.routers import keys, data, bots, trades  
# Import the background services
from backend.engine.websocket_streamer import okx_streamer  
from backend.engine.bot_manager import bot_manager

# Create database tables
Base.metadata.create_all(bind=engine)

# Lifespan context manager for background tasks
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start achtergrond processen
    stream_task = asyncio.create_task(okx_streamer.start())
    bot_task = asyncio.create_task(bot_manager.start()) 
    yield
    # Stop ze netjes
    okx_streamer.stop()
    bot_manager.stop() 
    await stream_task
    await bot_task

# Initialize FastAPI application with the lifespan manager
app = FastAPI(
    title="ApexAlgo Engine API", 
    version="0.1.0",
    swagger_ui_init_oauth={"clientId": "test"},
    lifespan=lifespan  
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Hiermee mag elk apparaat in je netwerk erbij
    allow_credentials=True,
    allow_methods=["*"],  # Dit staat GET, POST, OPTIONS, etc. toe
    allow_headers=["*"],  # Dit staat alle headers toe (zoals je API-sleutels)
)
# Connect routers to the main application
app.include_router(keys.router)
app.include_router(data.router)
app.include_router(bots.router)  
app.include_router(trades.router)

# Initialize Exchange (CCXT)
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
        raise HTTPException(status_code=400, detail=f"Failed to fetch price: {str(e)}")