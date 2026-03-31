from sqlalchemy import Column, Integer, String, Text
from backend.core.database import Base

class BotLog(Base):
    __tablename__ = "bot_logs"
    id       = Column(Integer, primary_key=True, autoincrement=True)
    bot_name = Column(String, nullable=False, index=True)
    ts       = Column(String, nullable=False)   # "HH:MM:SS" UTC
    level    = Column(String, nullable=False)   # "INFO" | "WARN" | "ERROR"
    msg      = Column(Text,   nullable=False)
