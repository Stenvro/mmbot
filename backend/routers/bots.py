from fastapi import APIRouter, Depends, HTTPException, Body 
from sqlalchemy.orm import Session 
from sqlalchemy.orm.attributes import flag_modified 
from pydantic import BaseModel 
from typing import List, Optional, Dict, Any 
from datetime import datetime, timezone
import json 
import asyncio

from backend.core.database import get_db, SessionLocal
from backend.models.bots import BotConfig 
from backend.models.signals import Signal 
from backend.models.orders import Order
from backend.models.positions import Position
from backend.core.events import event_bus 

router = APIRouter( 
    prefix="/api/bots", 
    tags=["Bots"] 
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
        except Exception: 
            signal_dict["extra_data"] = {} 
             
        result.append(signal_dict) 
         
    return result 

@router.post("/", response_model=BotResponse) 
def create_bot(bot_in: BotCreate, db: Session = Depends(get_db)): 
    existing_bot = db.query(BotConfig).filter(BotConfig.name == bot_in.name).first() 
    if existing_bot: 
        raise HTTPException(status_code=400, detail="A bot with this name already exists.") 
         
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
    return new_bot 

# FIX: Maak de update async zodat hij het opschonen (wat lang kan duren) in de achtergrond doet
@router.put("/{bot_id}") 
async def update_bot(bot_id: int, bot_data: dict = Body(...), db: Session = Depends(get_db)): 
    bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first() 
    if not bot: 
        raise HTTPException(status_code=404, detail="Bot not found") 

    if "is_sandbox" in bot_data: 
        bot.is_sandbox = bot_data["is_sandbox"] 
         
    if "settings" in bot_data: 
        current_settings = dict(bot.settings or {}) 
        for key, value in bot_data["settings"].items(): 
            current_settings[key] = value 
        bot.settings = current_settings 
        flag_modified(bot, "settings") 

        # We geven de opdracht om te schonen aan een achtergrond thread
        bot_name = bot.name
        asyncio.create_task(flush_bot_data(bot_name))

    db.commit() 
    return {"message": "Bot configuration updated successfully"} 

async def flush_bot_data(bot_name: str):
    def _flush():
        db = SessionLocal()
        try:
            db.query(Signal).filter(Signal.bot_name == bot_name).delete(synchronize_session=False)
            db.query(Order).filter(Order.bot_name == bot_name, Order.mode == "backtest").delete(synchronize_session=False)
            db.query(Position).filter(Position.bot_name == bot_name, Position.mode == "backtest").delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()
    
    await asyncio.to_thread(_flush)

@router.delete("/{bot_id}") 
def delete_bot(bot_id: int, db: Session = Depends(get_db)): 
    bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first() 
    if not bot: 
        raise HTTPException(status_code=404, detail="Bot not found.") 
         
    if bot.is_active: 
        raise HTTPException(status_code=400, detail="Cannot delete a running bot. Stop it first.") 
         
    db.query(Signal).filter(Signal.bot_name == bot.name).delete() 
    db.query(Order).filter(Order.bot_name == bot.name).delete()
    db.query(Position).filter(Position.bot_name == bot.name).delete()
    db.delete(bot) 
    db.commit() 
    return {"message": f"Bot '{bot.name}' deleted.", "is_active": False} 

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

@router.delete("/{bot_name}/cache") 
def clear_bot_cache(bot_name: str, db: Session = Depends(get_db)): 
    try: 
        deleted_signals = db.query(Signal).filter(Signal.bot_name == bot_name).delete(synchronize_session=False) 
        db.commit() 
        return {"status": "success", "message": f"Grafiek opgeschoond! {deleted_signals} oude signalen verwijderd."} 
    except Exception as e: 
        db.rollback() 
        raise HTTPException(status_code=500, detail=str(e))