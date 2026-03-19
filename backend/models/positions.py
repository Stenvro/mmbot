from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.core.database import Base

class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    bot_name = Column(String, index=True)               # Welke bot beheert dit?
    symbol = Column(String, index=True)                 # Bijv. "SOL/USDT"
    
    status = Column(String, default="open")             # "open" of "closed"
    
    profit_abs = Column(Float, nullable=True)           # Totale winst in geld 
    profit_pct = Column(Float, nullable=True)           # Totale winst in procenten
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)

    orders = relationship("Order", back_populates="position")