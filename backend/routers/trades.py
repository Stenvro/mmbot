import logging
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
import io
import csv
import math
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
def get_positions(symbol: str = None, mode: str = None, status: str = None, limit: int = Query(default=5000, le=50000), db: Session = Depends(get_db)):
    query = db.query(
        Position.id, Position.exchange, Position.bot_name, Position.symbol,
        Position.mode, Position.status, Position.side, Position.entry_price,
        Position.amount, Position.profit_abs, Position.profit_pct,
        Position.created_at, Position.closed_at
    )
    if symbol:
        formatted_symbol = symbol.replace('-', '/').upper()
        query = query.filter(Position.symbol == formatted_symbol)
    if mode: query = query.filter(Position.mode == mode)
    if status: query = query.filter(Position.status == status)
    query = query.order_by(Position.created_at.desc())
    if limit > 0:
        query = query.limit(limit)
    return [
        {"id": r[0], "exchange": r[1], "bot_name": r[2], "symbol": r[3],
         "mode": r[4], "status": r[5], "side": r[6], "entry_price": r[7],
         "amount": r[8], "profit_abs": r[9], "profit_pct": r[10],
         "created_at": r[11].isoformat() if r[11] else None,
         "closed_at": r[12].isoformat() if r[12] else None}
        for r in query.all()
    ]

@router.get("/orders")
def get_orders(symbol: str = None, mode: str = None, limit: int = Query(default=10000, le=50000), db: Session = Depends(get_db)):
    query = db.query(
        Order.id, Order.position_id, Order.exchange, Order.bot_name,
        Order.mode, Order.symbol, Order.side, Order.order_type,
        Order.price, Order.amount, Order.fee, Order.status, Order.timestamp
    )
    if symbol:
        formatted_symbol = symbol.replace('-', '/').upper()
        query = query.filter(Order.symbol == formatted_symbol)
    if mode: query = query.filter(Order.mode == mode)
    query = query.order_by(Order.timestamp.desc())
    if limit > 0:
        query = query.limit(limit)
    return [
        {"id": r[0], "position_id": r[1], "exchange": r[2], "bot_name": r[3],
         "mode": r[4], "symbol": r[5], "side": r[6], "order_type": r[7],
         "price": r[8], "amount": r[9], "fee": r[10], "status": r[11],
         "timestamp": r[12].isoformat() if r[12] else None}
        for r in query.all()
    ]

@router.get("/stats")
def get_trade_stats(
    bot_name: str = None, symbol: str = None, exchange: str = None, mode: str = None,
    db: Session = Depends(get_db)
):
    """Server-side trade statistics — avoids sending thousands of records to frontend."""
    query = db.query(Position).filter(Position.status == "closed")
    if bot_name: query = query.filter(Position.bot_name == bot_name)
    if symbol:
        formatted_symbol = symbol.replace('-', '/').upper()
        query = query.filter(Position.symbol == formatted_symbol)
    if exchange: query = query.filter(Position.exchange == exchange)
    if mode: query = query.filter(Position.mode == mode)

    closed = query.all()
    if not closed:
        return {"netPnl": 0, "winRate": 0, "wins": 0, "losses": 0, "total": 0, "profitFactor": 0, "maxDDpct": 0, "avgHoldMs": 0, "sharpe": 0, "totalFees": 0, "avgWin": 0, "avgLoss": 0}

    wins = [p for p in closed if (p.profit_abs or 0) > 0]
    losses = [p for p in closed if (p.profit_abs or 0) <= 0]
    gross_profit = sum(p.profit_abs or 0 for p in wins)
    gross_loss = abs(sum(p.profit_abs or 0 for p in losses))
    net_pnl = gross_profit - gross_loss
    win_rate = (len(wins) / len(closed)) * 100 if closed else 0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else (999 if gross_profit > 0 else 0)

    # Max drawdown — percentage of peak equity using backtest_capital
    sorted_pos = sorted(closed, key=lambda p: p.closed_at or datetime.min)
    # Look up backtest_capital from bot configs
    bot_names = list({p.bot_name for p in closed if p.bot_name})
    from backend.models.bots import BotConfig as _BC
    bot_capitals = []
    for bn in bot_names:
        bc = db.query(_BC.settings).filter(_BC.name == bn).first()
        if bc and bc[0]:
            bot_capitals.append(float(bc[0].get("backtest_capital", 1000)))
    starting_capital = max(bot_capitals) if bot_capitals else 1000.0

    equity = starting_capital
    peak_eq = starting_capital
    max_dd_pct = 0.0
    for p in sorted_pos:
        equity += (p.profit_abs or 0)
        if equity > peak_eq: peak_eq = equity
        if peak_eq > 0: max_dd_pct = max(max_dd_pct, ((peak_eq - equity) / peak_eq) * 100)

    # Avg hold time
    hold_times = []
    for p in closed:
        if p.closed_at and p.created_at:
            diff = (p.closed_at - p.created_at).total_seconds() * 1000
            if diff > 0: hold_times.append(diff)
    avg_hold_ms = sum(hold_times) / len(hold_times) if hold_times else 0

    # Simplified Sharpe
    returns = [p.profit_pct or 0 for p in closed]
    mean_ret = sum(returns) / len(returns) if returns else 0
    variance = sum((r - mean_ret) ** 2 for r in returns) / (len(returns) - 1) if len(returns) > 1 else 0
    stddev = math.sqrt(variance) if variance > 0 else 0
    sharpe = mean_ret / stddev if stddev > 0 else 0

    # Total fees
    pos_ids = [p.id for p in closed]
    total_fees = 0.0
    if pos_ids:
        fee_result = db.query(sql_func.sum(Order.fee)).filter(Order.position_id.in_(pos_ids)).scalar()
        total_fees = float(fee_result or 0)

    return {
        "netPnl": net_pnl,
        "winRate": win_rate,
        "wins": len(wins),
        "losses": len(losses),
        "total": len(closed),
        "profitFactor": profit_factor,
        "maxDDpct": max_dd_pct,
        "avgHoldMs": avg_hold_ms,
        "sharpe": sharpe,
        "totalFees": total_fees,
        "avgWin": gross_profit / len(wins) if wins else 0,
        "avgLoss": gross_loss / len(losses) if losses else 0,
    }


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

@router.post("/positions/bulk-delete")
def bulk_delete_positions(ids: list[int] = Body(...), db: Session = Depends(get_db)):
    """Delete multiple positions and their orders in a single transaction."""
    if not ids:
        return {"deleted": 0}
    try:
        db.query(Order).filter(Order.position_id.in_(ids)).delete(synchronize_session=False)
        deleted = db.query(Position).filter(Position.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        return {"deleted": deleted}
    except Exception as e:
        db.rollback()
        logger.error("Bulk delete failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete trades.")

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
        latest_candle = db.query(Candle).filter(Candle.symbol == pos.symbol, Candle.exchange == (pos.exchange or "okx")).order_by(Candle.timestamp.desc()).first()
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
    def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Timestamp", "Bot Name", "Symbol", "Side", "Type", "Price", "Amount", "Fee", "Exchange Order ID"])
        yield output.getvalue()
        output.seek(0)
        output.truncate()

        for order in db.query(Order).filter(Order.mode == mode, Order.status == "filled").order_by(Order.timestamp.desc()).yield_per(500):
            writer.writerow([
                order.id, order.timestamp.strftime("%Y-%m-%d %H:%M:%S") if order.timestamp else "",
                order.bot_name, order.symbol, order.side.upper(), order.order_type.upper(),
                order.price, order.amount, order.fee, order.exchange_order_id or "N/A"
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate()

    return StreamingResponse(generate(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=apexalgo_{mode}_trades.csv"})
