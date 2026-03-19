from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.core.database import Base

class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)
    
    candle_id = Column(Integer, ForeignKey("candles.id", ondelete="CASCADE"))
    
    symbol = Column(String, index=True)                 # Bijv. "SOL/USDT"
    timestamp = Column(DateTime, index=True)            # Exacte tijd van het signaal
    
    bot_name = Column(String, index=True, nullable=True)
    name = Column(String, index=True)                   # Bijv. "RSI_14", "MACD", of "TRADE_TRIGGER"

    value = Column(Float, nullable=True)                # Voor indicatoren (bijv. 72.5)
    action = Column(String, nullable=True)              # Voor acties ("buy", "sell", "strong_buy")
    
    extra_data = Column(JSON, default={})               

    candle = relationship("Candle", back_populates="signals")