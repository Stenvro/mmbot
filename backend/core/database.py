import logging
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

logger = logging.getLogger("apexalgo.database")

SQLALCHEMY_DATABASE_URL = "sqlite:///./data/ApexAlgoDB.sqlite3"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def run_migrations():
    """Add new columns to existing tables that create_all() won't update."""
    inspector = inspect(engine)
    if "positions" not in inspector.get_table_names():
        return
    columns = {c['name'] for c in inspector.get_columns('positions')}
    with engine.connect() as conn:
        if 'highest_price' not in columns:
            conn.execute(text("ALTER TABLE positions ADD COLUMN highest_price REAL"))
            logger.info("Migration: added 'highest_price' column to positions table")
        if 'triggered_exits' not in columns:
            conn.execute(text("ALTER TABLE positions ADD COLUMN triggered_exits JSON"))
            logger.info("Migration: added 'triggered_exits' column to positions table")
        conn.commit()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()