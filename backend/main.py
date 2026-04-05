import logging
import os
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import asyncio
from contextlib import asynccontextmanager

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

from backend.core.database import engine, Base, run_migrations
from backend.core.security import verify_api_key

# Ensure SQLAlchemy knows about all models before calling create_all()
from backend.models.positions import Position
from backend.models.orders import Order
from backend.models.candles import Candle
from backend.models.signals import Signal
from backend.models.preferences import Preference
from backend.models.exchange_keys import ExchangeKey
from backend.models.bots import BotConfig
from backend.models.bot_logs import BotLog

# Import the routers
from backend.routers import keys, data, bots, trades
# Import the background services
from backend.engine.candle_poller import candle_poller
from backend.engine.bot_manager import bot_manager
from backend.core.exchange_registry import build_exchange

# Create database tables and run migrations for existing DBs
Base.metadata.create_all(bind=engine)
run_migrations()

# Lifespan context manager for background tasks
@asynccontextmanager
async def lifespan(app: FastAPI):
    poll_task = asyncio.create_task(candle_poller.start())
    bot_task = asyncio.create_task(bot_manager.start())
    yield
    candle_poller.stop()
    bot_manager.stop()
    await poll_task
    await bot_task

# Initialize FastAPI application with the lifespan manager
app = FastAPI(
    title="ApexAlgo Engine API",
    version="0.1.0",
    swagger_ui_init_oauth={"clientId": "test"},
    lifespan=lifespan
)
cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
# Connect routers to the main application
app.include_router(keys.router)
app.include_router(data.router)
app.include_router(bots.router)
app.include_router(trades.router)


@app.get("/", dependencies=[Depends(verify_api_key)])
def read_root():
    return {"status": "online", "message": "ApexAlgo Engine is running and modularized!"}

@app.get("/api/price/{symbol}", dependencies=[Depends(verify_api_key)])
def get_price(symbol: str, exchange: str = Query(default="okx")):
    try:
        exch = build_exchange(exchange.lower())
        formatted_symbol = symbol.replace('-', '/').upper()
        ticker = exch.fetch_ticker(formatted_symbol)
        return {
            "exchange": exchange.upper(),
            "symbol": formatted_symbol,
            "price": ticker['last'],
            "timestamp": ticker['datetime']
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch price: {str(e)}")
