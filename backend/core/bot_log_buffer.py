from datetime import datetime, timezone
from backend.core.database import SessionLocal
from backend.models.bot_logs import BotLog


def push(bot_name: str, level: str, msg: str) -> None:
    """Write a structured log entry to the DB. Thread-safe — called from bot_manager threads."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    db = SessionLocal()
    try:
        db.add(BotLog(bot_name=bot_name, ts=ts, level=level, msg=msg))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def get_logs(bot_name: str, since_id: int = 0) -> list:
    """Return up to 200 log entries for a bot with id > since_id, ordered ascending."""
    db = SessionLocal()
    try:
        entries = (
            db.query(BotLog)
            .filter(BotLog.bot_name == bot_name, BotLog.id > since_id)
            .order_by(BotLog.id)
            .limit(200)
            .all()
        )
        return [{"seq": e.id, "ts": e.ts, "level": e.level, "msg": e.msg} for e in entries]
    finally:
        db.close()


def clear(bot_name: str) -> None:
    """Delete all log entries for a bot (called on cache wipe)."""
    db = SessionLocal()
    try:
        db.query(BotLog).filter(BotLog.bot_name == bot_name).delete()
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
