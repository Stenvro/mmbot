from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
import csv

from backend.core.database import get_db
from backend.models.positions import Position
from backend.models.orders import Order

router = APIRouter(
    prefix="/api/trades",
    tags=["Trades"]
)

@router.get("/positions")
def get_positions(symbol: str = None, mode: str = None, status: str = None, db: Session = Depends(get_db)):
    query = db.query(Position)
    if symbol:
        formatted_symbol = symbol.replace('-', '/').upper()
        query = query.filter(Position.symbol == formatted_symbol)
    if mode: query = query.filter(Position.mode == mode)
    if status: query = query.filter(Position.status == status)
    return query.order_by(Position.created_at.desc()).all()

@router.get("/orders")
def get_orders(symbol: str = None, mode: str = None, db: Session = Depends(get_db)):
    query = db.query(Order)
    if symbol:
        formatted_symbol = symbol.replace('-', '/').upper()
        query = query.filter(Order.symbol == formatted_symbol)
    if mode: query = query.filter(Order.mode == mode)
    return query.order_by(Order.timestamp.desc()).all()

from typing import Optional

@router.delete("/bot/{bot_name}")
def delete_bot_trades(bot_name: str, mode: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Verwijdert trade history van een bot.
    Als mode is meegegeven ('backtest', 'paper', 'live'), verwijdert hij ALLEEN die specifieke data.
    """
    order_query = db.query(Order).filter(Order.bot_name == bot_name)
    pos_query = db.query(Position).filter(Position.bot_name == bot_name)
    
    if mode:
        order_query = order_query.filter(Order.mode == mode)
        pos_query = pos_query.filter(Position.mode == mode)
        
    orders_deleted = order_query.delete(synchronize_session=False)
    pos_deleted = pos_query.delete(synchronize_session=False)
    
    db.commit()
    return {"message": f"Deleted {orders_deleted} orders and {pos_deleted} positions for '{bot_name}' in mode: {mode or 'ALL'}."}

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