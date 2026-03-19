from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from datetime import datetime, timezone
from backend.core.database import Base

class BotConfig(Base):
    __tablename__ = "bots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)      # Bijv. "Veilige BTC Bot"
    is_active = Column(Boolean, default=False)          # Mag hij nu traden?
    is_sandbox = Column(Boolean, default=True)          # Zit hij in sandbox?
    strategy = Column(String)                           # Welk Python-script gebruikt hij?
    
    settings = Column(JSON, default={})                 
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))