import logging
import json
import asyncio
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Body, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from backend.core.database import get_db, SessionLocal
from backend.models.bots import BotConfig
from backend.models.signals import Signal
from backend.models.orders import Order
from backend.models.positions import Position
from backend.core.events import event_bus
from backend.core.security import verify_api_key
from backend.engine.settings_validator import validate_bot_settings
from backend.core import bot_log_buffer as blb
from backend.models.bot_logs import BotLog

logger = logging.getLogger("apexalgo.bots")

router = APIRouter(
    prefix="/api/bots",
    tags=["Bots"],
    dependencies=[Depends(verify_api_key)]
)

class BotBase(BaseModel):
    name: str
    is_sandbox: bool = True
    strategy: str = "node_evaluator"
    settings: Dict[str, Any] = {}

class BotCreate(BotBase):
    pass

class BotResponse(BotBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("/", response_model=List[BotResponse])
def get_all_bots(db: Session = Depends(get_db)):
    return db.query(BotConfig).all()

@router.get("/signals")
def get_bot_signals(symbol: str, timeframe: str, limit: int = 100000, db: Session = Depends(get_db)):
    all_bots = db.query(BotConfig).all()

    valid_bot_names = [
        bot.name for bot in all_bots
        if bot.settings and bot.settings.get('timeframe') == timeframe and (symbol in bot.settings.get('symbols', []) or symbol == bot.settings.get('symbol'))
    ]

    if not valid_bot_names:
        return []

    signals = db.query(Signal).filter(
        Signal.symbol == symbol,
        Signal.bot_name.in_(valid_bot_names)
    ).order_by(Signal.timestamp.desc()).limit(limit).all()

    signals.reverse()

    result = []
    for s in signals:
        signal_dict = {
            "id": s.id,
            "candle_id": s.candle_id,
            "symbol": s.symbol,
            "timestamp": int(s.timestamp.replace(tzinfo=timezone.utc).timestamp()) if s.timestamp else None,
            "bot_name": s.bot_name,
            "name": s.name,
            "action": s.action,
            "value": s.value,
        }

        try:
            if isinstance(s.extra_data, str):
                signal_dict["extra_data"] = json.loads(s.extra_data)
            else:
                signal_dict["extra_data"] = s.extra_data or {}
        except (json.JSONDecodeError, TypeError):
            signal_dict["extra_data"] = {}

        result.append(signal_dict)

    return result

@router.post("/")
def create_bot(bot_in: BotCreate, db: Session = Depends(get_db)):
    existing_bot = db.query(BotConfig).filter(BotConfig.name == bot_in.name).first()
    if existing_bot:
        raise HTTPException(status_code=400, detail="A bot with this name already exists.")

    validation = validate_bot_settings(bot_in.settings)
    if validation["errors"]:
        raise HTTPException(status_code=400, detail={"validation_errors": validation["errors"]})

    new_bot = BotConfig(
        name=bot_in.name,
        is_sandbox=bot_in.is_sandbox,
        strategy=bot_in.strategy,
        settings=bot_in.settings,
        is_active=False
    )
    db.add(new_bot)
    db.commit()
    db.refresh(new_bot)

    result = {
        "id": new_bot.id, "name": new_bot.name, "is_sandbox": new_bot.is_sandbox,
        "strategy": new_bot.strategy, "settings": new_bot.settings,
        "is_active": new_bot.is_active, "created_at": new_bot.created_at.isoformat() if new_bot.created_at else None,
    }
    if validation["warnings"]:
        result["validation_warnings"] = validation["warnings"]
    return result

@router.post("/import")
def import_bot(payload: dict = Body(...), db: Session = Depends(get_db)):
    try:
        bot_data = payload.get("bot")
        if not bot_data:
            raise HTTPException(status_code=400, detail="Invalid file: missing 'bot' key.")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid bot file format.")

    name = bot_data.get("name", "Imported Bot")
    if db.query(BotConfig).filter(BotConfig.name == name).first():
        name = f"{name} (imported)"

    validation = validate_bot_settings(bot_data.get("settings", {}))
    if validation["errors"]:
        raise HTTPException(status_code=400, detail={"validation_errors": validation["errors"]})

    new_bot = BotConfig(
        name=name,
        is_sandbox=bot_data.get("is_sandbox", True),
        strategy=bot_data.get("strategy", "node_evaluator"),
        settings=bot_data.get("settings", {}),
        is_active=False
    )
    db.add(new_bot)
    db.commit()
    db.refresh(new_bot)

    result = {
        "id": new_bot.id, "name": new_bot.name, "is_sandbox": new_bot.is_sandbox,
        "strategy": new_bot.strategy, "settings": new_bot.settings,
        "is_active": new_bot.is_active, "created_at": new_bot.created_at.isoformat() if new_bot.created_at else None,
    }
    if validation["warnings"]:
        result["validation_warnings"] = validation["warnings"]
    return result

@router.put("/{bot_id}")
async def update_bot(bot_id: int, bot_data: dict = Body(...), db: Session = Depends(get_db)):
    bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    if "name" in bot_data and bot_data["name"] != bot.name:
        new_name = bot_data["name"]
        existing = db.query(BotConfig).filter(BotConfig.name == new_name, BotConfig.id != bot_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="A bot with this name already exists.")
        old_name = bot.name
        bot.name = new_name
        db.query(Signal).filter(Signal.bot_name == old_name).update({"bot_name": new_name}, synchronize_session=False)
        db.query(Order).filter(Order.bot_name == old_name).update({"bot_name": new_name}, synchronize_session=False)
        db.query(Position).filter(Position.bot_name == old_name).update({"bot_name": new_name}, synchronize_session=False)

    if "is_sandbox" in bot_data:
        bot.is_sandbox = bot_data["is_sandbox"]

    validation_warnings = []
    if "settings" in bot_data:
        # Re-read settings inside a begin to reduce race window
        current_settings = dict(bot.settings or {})
        for key, value in bot_data["settings"].items():
            current_settings[key] = value

        validation = validate_bot_settings(current_settings)
        if validation["errors"]:
            raise HTTPException(status_code=400, detail={"validation_errors": validation["errors"]})
        validation_warnings = validation["warnings"]

        bot.settings = current_settings
        flag_modified(bot, "settings")

        # Flush stale signals and backtest data in the background
        bot_name = bot.name
        asyncio.create_task(flush_bot_data(bot_name))

    db.commit()
    result = {"message": "Bot configuration updated successfully"}
    if validation_warnings:
        result["validation_warnings"] = validation_warnings
    return result

async def flush_bot_data(bot_name: str):
    def _flush():
        db = SessionLocal()
        try:
            db.query(Signal).filter(Signal.bot_name == bot_name).delete(synchronize_session=False)
            db.query(Order).filter(Order.bot_name == bot_name, Order.mode == "backtest").delete(synchronize_session=False)
            db.query(Position).filter(Position.bot_name == bot_name, Position.mode == "backtest").delete(synchronize_session=False)
            db.commit()
        except Exception as e:
            logger.error("Failed to flush bot data for '%s': %s", bot_name, e)
            db.rollback()
        finally:
            db.close()

    await asyncio.to_thread(_flush)

def _cleanup_bot_data(bot_name: str):
    """Background task: delete all trade data and logs for a removed bot."""
    db = SessionLocal()
    try:
        db.query(Order).filter(Order.bot_name == bot_name).delete()
        db.query(Position).filter(Position.bot_name == bot_name).delete()
        db.query(Signal).filter(Signal.bot_name == bot_name).delete()
        db.query(BotLog).filter(BotLog.bot_name == bot_name).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Background cleanup failed for '%s': %s", bot_name, e)
    finally:
        db.close()

@router.delete("/{bot_id}")
def delete_bot(bot_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")

    if bot.is_active:
        raise HTTPException(status_code=400, detail="Cannot delete a running bot. Stop it first.")

    bot_name = bot.name
    db.delete(bot)
    db.commit()

    # Heavy cleanup (orders, positions, signals, logs) runs after response is sent
    background_tasks.add_task(_cleanup_bot_data, bot_name)
    return {"message": f"Bot '{bot_name}' deleted.", "is_active": False}

@router.post("/{bot_id}/start")
async def start_bot(bot_id: int, db: Session = Depends(get_db)):
    bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
    if not bot: raise HTTPException(status_code=404, detail="Bot not found.")
    if bot.is_active: raise HTTPException(status_code=400, detail="Already active.")

    bot.is_active = True
    db.commit()
    await event_bus.publish("BOT_STATE_CHANGED", {"bot_id": bot.id, "action": "started"})
    return {"message": f"Bot '{bot.name}' started.", "is_active": True}

@router.post("/{bot_id}/stop")
async def stop_bot(bot_id: int, db: Session = Depends(get_db)):
    bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
    if not bot: raise HTTPException(status_code=404, detail="Bot not found.")

    bot.is_active = False
    db.commit()
    await event_bus.publish("BOT_STATE_CHANGED", {"bot_id": bot.id, "action": "stopped"})
    return {"message": f"Bot '{bot.name}' stopped.", "is_active": False}

@router.post("/{bot_id}/duplicate")
def duplicate_bot(bot_id: int, db: Session = Depends(get_db)):
    source = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Bot not found.")

    base_name = source.name
    new_name = f"{base_name} (copy)"
    for i in range(2, 11):
        if not db.query(BotConfig).filter(BotConfig.name == new_name).first():
            break
        new_name = f"{base_name} (copy {i})"
    else:
        raise HTTPException(status_code=400, detail="Too many copies of this bot already exist.")

    new_bot = BotConfig(
        name=new_name,
        is_sandbox=source.is_sandbox,
        strategy=source.strategy,
        settings=dict(source.settings or {}),
        is_active=False
    )
    db.add(new_bot)
    db.commit()
    db.refresh(new_bot)
    return {
        "id": new_bot.id, "name": new_bot.name, "is_sandbox": new_bot.is_sandbox,
        "strategy": new_bot.strategy, "settings": new_bot.settings,
        "is_active": new_bot.is_active, "created_at": new_bot.created_at.isoformat() if new_bot.created_at else None,
    }

@router.get("/{bot_id}/export")
def export_bot(bot_id: int, db: Session = Depends(get_db)):
    bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")
    payload = {
        "apex_version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "bot": {
            "name": bot.name,
            "is_sandbox": bot.is_sandbox,
            "strategy": bot.strategy,
            "settings": bot.settings or {}
        }
    }
    filename = bot.name.replace(' ', '_') + ".apex.json"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/{bot_name}/logs")
def get_bot_logs(bot_name: str, since: int = Query(default=0)):
    entries = blb.get_logs(bot_name, since_id=since)
    return {"bot_name": bot_name, "entries": entries}

@router.delete("/{bot_name}/cache")
def clear_bot_cache(bot_name: str, db: Session = Depends(get_db)):
    try:
        deleted_signals = db.query(Signal).filter(Signal.bot_name == bot_name).delete(synchronize_session=False)
        db.commit()
        blb.clear(bot_name)
        return {"status": "success", "message": f"Cache cleared. {deleted_signals} signals removed. Log buffer reset."}
    except Exception as e:
        db.rollback()
        logger.error("Failed to clear cache for '%s': %s", bot_name, e)
        raise HTTPException(status_code=500, detail="Failed to clear cache.")
