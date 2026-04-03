import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
import io
import csv
from typing import Optional
from datetime import datetime, timezone

from backend.core.database import get_db
from backend.models.positions import Position
from backend.models.orders import Order
from backend.models.candles import Candle
from backend.core.security import verify_api_key

logger = logging.getLogger("apexalgo.trades")

router = APIRouter(
    prefix="/api/trades",
    tags=["Trades"],
    dependencies=[Depends(verify_api_key)]
)

@router.get("/positions")
def get_positions(symbol: str = None, mode: str = None, status: str = None, limit: int = 0, db: Session = Depends(get_db)):
    query = db.query(Position)
    if symbol:
        formatted_symbol = symbol.replace('-', '/').upper()
        query = query.filter(Position.symbol == formatted_symbol)
    if mode: query = query.filter(Position.mode == mode)
    if status: query = query.filter(Position.status == status)
    query = query.order_by(Position.created_at.desc())
    if limit > 0:
        query = query.limit(limit)
    return query.all()

@router.get("/orders")
def get_orders(symbol: str = None, mode: str = None, limit: int = 0, db: Session = Depends(get_db)):
    query = db.query(Order)
    if symbol:
        formatted_symbol = symbol.replace('-', '/').upper()
        query = query.filter(Order.symbol == formatted_symbol)
    if mode: query = query.filter(Order.mode == mode)
    query = query.order_by(Order.timestamp.desc())
    if limit > 0:
        query = query.limit(limit)
    return query.all()

@router.delete("/bot/{bot_name}")
def delete_bot_trades(bot_name: str, mode: Optional[str] = None, db: Session = Depends(get_db)):
    order_query = db.query(Order).filter(Order.bot_name == bot_name)
    pos_query = db.query(Position).filter(Position.bot_name == bot_name)

    if mode:
        order_query = order_query.filter(Order.mode == mode)
        pos_query = pos_query.filter(Position.mode == mode)

    orders_deleted = order_query.delete(synchronize_session=False)
    pos_deleted = pos_query.delete(synchronize_session=False)

    db.commit()
    return {"message": f"Deleted {orders_deleted} orders and {pos_deleted} positions for '{bot_name}' in mode: {mode or 'ALL'}."}

@router.delete("/positions/{position_id}")
def delete_historical_position(position_id: int, db: Session = Depends(get_db)):
    pos = db.query(Position).filter(Position.id == position_id).first()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    try:
        db.query(Order).filter(Order.position_id == position_id).delete()
        db.delete(pos)
        db.commit()
        return {"status": "success", "message": "Trade permanently deleted."}
    except Exception as e:
        db.rollback()
        logger.error("Failed to delete position %d: %s", position_id, e)
        raise HTTPException(status_code=500, detail="Failed to delete trade.")

@router.post("/positions/{position_id}/close")
def force_close_position(position_id: int, db: Session = Depends(get_db)):
    pos = db.query(Position).filter(Position.id == position_id).first()
    if not pos:
        return JSONResponse(status_code=404, content={"detail": "Position not found"})
    if pos.status == "closed":
        return JSONResponse(status_code=400, content={"detail": "Position is already closed."})

    # Atomically mark as closed to prevent double-close race
    rows_updated = db.query(Position).filter(
        Position.id == position_id,
        Position.status == "open"
    ).update({"status": "closing"}, synchronize_session="fetch")

    if rows_updated == 0:
        return JSONResponse(status_code=400, content={"detail": "Position is already being closed."})

    try:
        # Refresh to get the updated state
        db.refresh(pos)

        # Use the most recent candle close price to calculate realised PnL
        latest_candle = db.query(Candle).filter(Candle.symbol == pos.symbol).order_by(Candle.timestamp.desc()).first()
        close_price = latest_candle.close if latest_candle else pos.entry_price

        profit_abs = (close_price - pos.entry_price) * pos.amount if pos.side == "long" else (pos.entry_price - close_price) * pos.amount
        profit_pct = ((close_price - pos.entry_price) / pos.entry_price) * 100 if pos.side == "long" else ((pos.entry_price - close_price) / pos.entry_price) * 100

        pos.status = "closed"
        pos.closed_at = datetime.now(timezone.utc)
        pos.profit_abs = profit_abs
        pos.profit_pct = profit_pct

        close_order = Order(
            position_id=pos.id,
            bot_name=pos.bot_name,
            mode=pos.mode,
            symbol=pos.symbol,
            side="sell" if pos.side == "long" else "buy",
            order_type="market",
            price=close_price,
            amount=pos.amount,
            timestamp=datetime.now(timezone.utc),
            status="filled"
        )
        db.add(close_order)
        db.commit()

        return {"status": "success", "message": f"Position forcefully closed at ${close_price:.2f}"}
    except Exception as e:
        db.rollback()
        logger.error("Failed to force close position %d: %s", position_id, e)
        return JSONResponse(status_code=500, content={"detail": "Failed to close position."})

@router.get("/export")
def export_trades_csv(mode: str = "live", db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.mode == mode, Order.status == "filled").order_by(Order.timestamp.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp", "Bot Name", "Symbol", "Side", "Type", "Price", "Amount", "Fee", "Exchange Order ID"])
    for order in orders:
        writer.writerow([
            order.id, order.timestamp.strftime("%Y-%m-%d %H:%M:%S") if order.timestamp else "",
            order.bot_name, order.symbol, order.side.upper(), order.order_type.upper(),
            order.price, order.amount, order.fee, order.exchange_order_id or "N/A"
        ])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=apexalgo_{mode}_trades.csv"})
