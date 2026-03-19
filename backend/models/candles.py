from sqlalchemy import Column, Integer, String, Float, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.core.database import Base

class Candle(Base):
    __tablename__ = "candles"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)         # Bijv. "SOL/USDT"
    timeframe = Column(String, index=True)      # Bijv. "1m", "15m", "1h", "1s"
    timestamp = Column(DateTime, index=True)    # Tijdstip van de candle
    
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float)
    marketcap = Column(Float)
    
    __table_args__ = (
        UniqueConstraint('symbol', 'timeframe', 'timestamp', name='_symbol_tf_ts_uc'),
    )

    signals = relationship("Signal", back_populates="candle", cascade="all, delete-orphan", passive_deletes=True)