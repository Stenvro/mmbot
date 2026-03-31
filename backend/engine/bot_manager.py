import asyncio
import logging
import time
import uuid
import pandas as pd
import ccxt
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from backend.core.database import SessionLocal
from backend.models.bots import BotConfig
from backend.models.candles import Candle
from backend.models.signals import Signal
from backend.models.orders import Order
from backend.models.positions import Position
from backend.models.exchange_keys import ExchangeKey
from backend.engine.evaluator import NodeEvaluator
from backend.core.events import event_bus
from backend.core.encryption import decrypt_data
from backend.core.exchange_registry import build_exchange_from_key
from backend.core import bot_log_buffer as blb

logger = logging.getLogger("apexalgo.bot_manager")

VALID_EXIT_TYPES = {'percentage', 'trailing', 'atr', 'fixed'}

class BotManager:
    def __init__(self):
        self.running = False
        self.position_states = {}
        self._position_states_lock = asyncio.Lock()

    async def start(self):
        self.running = True
        logger.info("Bot Manager started. Engine is fully operational.")

        asyncio.create_task(self._startup_backfill())
        asyncio.create_task(self._listen_for_bot_starts())

        queue = event_bus.subscribe("CANDLE_CLOSED")
        while self.running:
            try:
                event_data = await asyncio.wait_for(queue.get(), timeout=1.0)
                exchange = event_data.get("exchange", "okx")
                symbol = event_data["symbol"]
                timeframe = event_data["timeframe"]
                asyncio.create_task(self._process_bots(exchange, symbol, timeframe))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    def _get_ccxt_instance(self, api_key_record: ExchangeKey):
        return build_exchange_from_key(api_key_record)

    def _calculate_trade_amount(self, current_price, bot_settings):
        if not current_price or current_price <= 0:
            logger.warning("Invalid current_price (%s), cannot calculate trade amount", current_price)
            return None

        entry_settings = bot_settings.get("trade_settings", {}).get("entry", {})
        amount_type = entry_settings.get("amount_type", "percentage")
        raw_val = entry_settings.get("amount_value")

        try:
            amount_value = float(raw_val) if raw_val and float(raw_val) > 0 else 100.0
        except (ValueError, TypeError):
            amount_value = 100.0

        if amount_type == "fixed":
            trade_amount = amount_value / current_price
            return max(trade_amount, 0.0001)
        else:
            capital = float(bot_settings.get("backtest_capital", 1000))
            investment = capital * (amount_value / 100)
            trade_amount = investment / current_price
            return max(trade_amount, 0.0001)

    def _check_exits(self, open_position, row_close, row_high, row_low, is_sell_signal, bot_settings, current_atr=0.0):
        trade_settings = bot_settings.get("trade_settings", {})
        entry_settings = trade_settings.get("entry", {})
        events = []

        state = self.position_states.get(open_position.id)
        if not state or state.get('entry_price') != open_position.entry_price:
            # Restore persisted state from DB, or initialize fresh
            persisted_highest = open_position.highest_price or open_position.entry_price
            persisted_exits = set(open_position.triggered_exits or [])
            self.position_states[open_position.id] = {
                'entry_price': open_position.entry_price,
                'highest_price': max(persisted_highest, row_high),
                'triggered_exits': persisted_exits
            }
            state = self.position_states[open_position.id]
        else:
            state['highest_price'] = max(state['highest_price'], row_high)

        # Persist state back to DB for crash recovery
        open_position.highest_price = state['highest_price']

        sl_hit = False
        for i, sl in enumerate(entry_settings.get("stop_losses", [])):
            sl_id = f"sl_{i}"
            if sl_id in state['triggered_exits']: continue

            try:
                sl_val = float(sl.get('value', 0))
            except (ValueError, TypeError):
                continue

            if sl_val <= 0: continue

            sl_type = sl.get('type', '')
            if sl_type not in VALID_EXIT_TYPES:
                logger.warning("Invalid stop_loss type '%s' for sl_%d, skipping", sl_type, i)
                continue

            if sl_type == 'percentage':
                trigger_price = open_position.entry_price * (1 - (sl_val/100))
            elif sl_type == 'trailing':
                trigger_price = state['highest_price'] * (1 - (sl_val/100))
            elif sl_type == 'atr':
                if not (current_atr > 0): continue
                trigger_price = state['highest_price'] - (sl_val * current_atr)
            else:
                trigger_price = sl_val

            if row_low <= trigger_price:
                sl_close_type = sl.get('close_amount_type', 'percentage')
                sl_close_val = float(sl.get('close_amount_value', 100))
                events.append({
                    'qty_pct': sl_close_val,
                    'close_amount_type': sl_close_type,
                    'reason': "stop_loss",
                    'price': trigger_price,
                    'id': sl_id
                })
                sl_hit = True

        if not sl_hit:
            tps = []
            for i, tp in enumerate(entry_settings.get("take_profits", [])):
                tp_id = f"tp_{i}"
                if tp_id in state['triggered_exits']: continue

                try:
                    tp_val = float(tp.get('value', 0))
                except (ValueError, TypeError):
                    continue

                if tp_val <= 0: continue

                tp_type = tp.get('type', '')
                if tp_type not in VALID_EXIT_TYPES:
                    logger.warning("Invalid take_profit type '%s' for tp_%d, skipping", tp_type, i)
                    continue

                tp_close_type = tp.get('close_amount_type', 'percentage')
                tp_close_val = float(tp.get('close_amount_value', 100))

                if tp_type == 'percentage':
                    t_price = open_position.entry_price * (1 + (tp_val/100))
                    if row_high >= t_price:
                        tps.append({'id': tp_id, 'price': t_price, 'pct': tp_close_val, 'close_amount_type': tp_close_type})
                elif tp_type == 'trailing':
                    # Trailing TP: price must first rise above entry by tp_val%, then
                    # we close when price drops tp_val% from the highest price reached.
                    activation_price = open_position.entry_price * (1 + (tp_val / 100))
                    if state['highest_price'] >= activation_price:
                        # Once activated, trail below the peak
                        t_price = state['highest_price'] * (1 - (tp_val / 100))
                        if row_low <= t_price:
                            tps.append({'id': tp_id, 'price': t_price, 'pct': tp_close_val, 'close_amount_type': tp_close_type})
                elif tp_type == 'atr':
                    if not (current_atr > 0): continue
                    t_price = state['highest_price'] - (tp_val * current_atr)
                    if row_low <= t_price:
                        tps.append({'id': tp_id, 'price': t_price, 'pct': tp_close_val, 'close_amount_type': tp_close_type})
                else:
                    t_price = tp_val
                    if row_high >= t_price:
                        tps.append({'id': tp_id, 'price': t_price, 'pct': tp_close_val, 'close_amount_type': tp_close_type})

            tps = sorted(tps, key=lambda x: x['price'], reverse=True)

            for tp in tps:
                events.append({
                    'qty_pct': tp['pct'],
                    'close_amount_type': tp.get('close_amount_type', 'percentage'),
                    'reason': "take_profit",
                    'price': tp['price'],
                    'id': tp['id']
                })

        if not events and is_sell_signal:
            exit_settings = trade_settings.get("exit", {})
            pct_to_close = float(exit_settings.get('amount_value', 100)) if exit_settings.get('amount_type') == 'percentage' else 100
            events.append({
                'qty_pct': pct_to_close,
                'reason': "strategy",
                'price': row_close,
                'id': 'strategy_sell'
            })

        return events

    async def _startup_backfill(self):
        def get_active_bot_ids():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
                return [bot.id for bot in active_bots]
            finally:
                db.close()

        bot_ids = await asyncio.to_thread(get_active_bot_ids)
        for bot_id in bot_ids:
            asyncio.create_task(self._run_backfill_safely(bot_id))

    async def _listen_for_bot_starts(self):
        queue = event_bus.subscribe("BOT_STATE_CHANGED")
        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                if event["action"] == "started":
                    asyncio.create_task(self._run_backfill_safely(event["bot_id"]))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def _run_backfill_safely(self, bot_id: int):
        try:
            await asyncio.to_thread(self._execute_sync_backfill, bot_id)
        except Exception as e:
            logger.error("Error during thread backfill for bot_id=%s: %s", bot_id, e, exc_info=True)

    def _execute_sync_backfill(self, bot_id: int):
        db = SessionLocal()
        _log_name = f"bot_id={bot_id}"
        try:
            bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
            if not bot or not bot.is_active: return
            _log_name = bot.name

            is_api_exec = bot.settings.get("api_execution", False)
            has_key = bool(bot.settings.get("api_key_name"))

            live_mode = "forward_test"
            exchange_name = bot.settings.get("data_exchange", "okx")
            if is_api_exec and has_key:
                api_key = db.query(ExchangeKey).filter(ExchangeKey.name == bot.settings.get("api_key_name")).first()
                if api_key:
                    live_mode = "paper" if api_key.is_sandbox else "live"
                    exchange_name = api_key.exchange or exchange_name
                else:
                    logger.warning("Bot '%s': api_key_name='%s' not found in database. Falling back to forward_test mode.", bot.name, bot.settings.get("api_key_name"))
                    blb.push(bot.name, "WARN", f"API key '{bot.settings.get('api_key_name')}' not found, running as forward_test")

            timeframe = bot.settings.get("timeframe")
            exit_node = bot.settings.get("exit_node")
            run_backtest = bot.settings.get("backtest_on_start", False)
            lookback_limit = int(bot.settings.get("backtest_lookback", 150))

            symbols = bot.settings.get("symbols", [])
            if not symbols and bot.settings.get("symbol"):
                symbols = [bot.settings.get("symbol")]

            for symbol in symbols:
                tf_seconds = 60
                if timeframe.endswith('m'): tf_seconds = int(timeframe[:-1]) * 60
                elif timeframe.endswith('h'): tf_seconds = int(timeframe[:-1]) * 3600
                elif timeframe.endswith('d'): tf_seconds = int(timeframe[:-1]) * 86400

                # Use fresh sessions for all polling queries. The main `db` session starts an
                # implicit SQLite transaction on its first read (line above), so any subsequent
                # reads on it see a stale snapshot and will never reflect candles written by
                # the streamer in a separate session. Fresh sessions start new transactions
                # that see all committed data.
                def _count_candles():
                    _db = SessionLocal()
                    try:
                        return _db.query(Candle.id).filter(Candle.exchange == exchange_name, Candle.symbol == symbol, Candle.timeframe == timeframe).count()
                    finally:
                        _db.close()

                def _latest_candle_ts():
                    _db = SessionLocal()
                    try:
                        return _db.query(Candle.timestamp).filter(
                            Candle.exchange == exchange_name, Candle.symbol == symbol, Candle.timeframe == timeframe
                        ).order_by(Candle.timestamp.desc()).first()
                    finally:
                        _db.close()

                initial_count = _count_candles()
                logger.info("Waiting for sufficient candle data for %s (currently %d candles)...", symbol, initial_count)
                blb.push(bot.name, "INFO", f"Waiting for candle data: {symbol} ({initial_count} candles)")
                last_count = -1
                stagnant_checks = 0

                while True:
                    current_count = _count_candles()

                    if current_count >= lookback_limit:
                        logger.info("Sufficient data available for %s (%d/%d).", symbol, current_count, lookback_limit)
                        blb.push(bot.name, "INFO", f"Data ready: {symbol} ({current_count}/{lookback_limit} candles)")
                        break

                    if current_count == last_count:
                        stagnant_checks += 1
                        max_stagnant = 24 if current_count == initial_count else 6

                        if stagnant_checks >= max_stagnant:
                            logger.info("Data ingestion stalled for %s at %d candles. Proceeding with available data.", symbol, current_count)
                            blb.push(bot.name, "WARN", f"Data stalled at {current_count} candles for {symbol}, proceeding")
                            break
                    else:
                        stagnant_checks = 0

                    last_count = current_count
                    time.sleep(5)

                for _ in range(20):
                    latest_candle = _latest_candle_ts()

                    if latest_candle:
                        candle_ts = latest_candle[0]
                        if candle_ts.tzinfo is None: candle_ts = candle_ts.replace(tzinfo=timezone.utc)
                        diff_seconds = datetime.now(timezone.utc).timestamp() - candle_ts.timestamp()
                        if diff_seconds <= (tf_seconds * 2): break
                    time.sleep(1)

                # Fresh session for the candle read as well — same stale-snapshot reason.
                candle_db = SessionLocal()
                try:
                    query = candle_db.query(Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).filter(
                        Candle.exchange == exchange_name, Candle.symbol == symbol, Candle.timeframe == timeframe
                    ).order_by(Candle.timestamp.desc()).limit(lookback_limit).statement
                    df = pd.read_sql(query, candle_db.bind)
                finally:
                    candle_db.close()

                if df.empty or len(df) < 50:
                    logger.info("Skipping backfill for %s: insufficient data (%d candles, minimum 50 required).", symbol, len(df))
                    blb.push(bot.name, "WARN", f"Skipping {symbol}: only {len(df)} candles, need 50+")
                    continue

                df = df.sort_values('timestamp').reset_index(drop=True)

                evaluator = NodeEvaluator(bot.settings)
                evaluator.df = df.copy()
                evaluator._calculate_indicators()

                existing_timestamps = {s[0] for s in db.query(Signal.timestamp).filter(Signal.bot_name == bot.name, Signal.symbol == symbol).all()}

                open_bt_pos = None
                last_bt_ts = None

                if run_backtest:
                    last_order = db.query(Order).filter(Order.bot_name == bot.name, Order.symbol == symbol, Order.mode == "backtest").order_by(Order.timestamp.desc()).first()
                    if last_order:
                        last_bt_ts = last_order.timestamp
                        if last_bt_ts.tzinfo is None: last_bt_ts = last_bt_ts.replace(tzinfo=timezone.utc)

                    open_bt_pos = db.query(Position).filter(Position.bot_name == bot.name, Position.symbol == symbol, Position.mode == "backtest", Position.status == "open").first()

                new_signals = []
                standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'atr']

                entry_series = evaluator.resolve_node(bot.settings.get("entry_node")) if bot.settings.get("entry_node") else pd.Series(False, index=evaluator.df.index)
                exit_series = evaluator.resolve_node(exit_node) if exit_node else pd.Series(False, index=evaluator.df.index)

                cooldown_trades = int(bot.settings.get("cooldown_trades", 0))
                cooldown_candles = int(bot.settings.get("cooldown_candles", 0))
                trade_entry_indices = []

                # Fee and slippage for realistic backtest P&L
                bt_trade_settings = bot.settings.get("trade_settings", {})
                bt_entry_fee = float(bt_trade_settings.get("entry", {}).get("fee", 0)) / 100
                raw_exit_fee = bt_trade_settings.get("exit", {}).get("fee")
                bt_exit_fee = float(raw_exit_fee) / 100 if raw_exit_fee is not None else bt_entry_fee
                bt_entry_slippage = float(bt_trade_settings.get("entry", {}).get("slippage", 0)) / 100
                bt_exit_slippage = float(bt_trade_settings.get("exit", {}).get("slippage", 0)) / 100

                # Track original amount for weighted profit_pct calculation
                original_amount = None

                for index, row in evaluator.df.iterrows():
                    ts = row['timestamp']
                    if ts.tzinfo is None: ts = ts.replace(tzinfo=timezone.utc)

                    current_price = float(row['close'])
                    current_high = float(row['high'])
                    current_low = float(row['low'])
                    just_opened_this_tick = False

                    is_buy = bool(entry_series.iloc[index])
                    is_sell = bool(exit_series.iloc[index])
                    current_atr = float(evaluator.df['atr'].iloc[index]) if 'atr' in evaluator.df.columns and not pd.isna(evaluator.df['atr'].iloc[index]) else 0.0

                    if run_backtest and (last_bt_ts is None or ts > last_bt_ts):
                        max_pos = int(bot.settings.get("max_positions", 1))

                        # Cooldown check: block entry if too many trades occurred within the cooldown window
                        can_buy_cooldown = True
                        if cooldown_trades > 0 and cooldown_candles > 0:
                            recent_trades = [idx for idx in trade_entry_indices if (index - idx) < cooldown_candles]
                            if len(recent_trades) >= cooldown_trades:
                                can_buy_cooldown = False

                        if is_buy and not open_bt_pos and 1 <= max_pos and can_buy_cooldown:
                            trade_amount = self._calculate_trade_amount(current_price, bot.settings)
                            if trade_amount is None:
                                continue
                            trade_entry_indices.append(index)
                            original_amount = trade_amount
                            bt_entry_price = current_price * (1 + bt_entry_slippage)
                            open_bt_pos = Position(exchange=exchange_name, bot_name=bot.name, symbol=symbol, mode="backtest", status="open", side="long", entry_price=bt_entry_price, amount=trade_amount)
                            db.add(open_bt_pos)
                            db.flush()
                            db.add(Order(position_id=open_bt_pos.id, exchange=exchange_name, bot_name=bot.name, mode="backtest", symbol=symbol, side="buy", order_type="market", price=bt_entry_price, amount=trade_amount, timestamp=ts, status="filled"))
                            just_opened_this_tick = True

                        elif open_bt_pos and not just_opened_this_tick:
                            exit_events = self._check_exits(open_bt_pos, current_price, current_high, current_low, is_sell, bot.settings, current_atr)

                            for ev in exit_events:
                                if open_bt_pos is None: break

                                if ev.get('close_amount_type') == 'fixed':
                                    close_qty = min(ev['qty_pct'], open_bt_pos.amount)
                                else:
                                    close_qty = open_bt_pos.amount * (ev['qty_pct'] / 100)
                                close_qty = min(close_qty, open_bt_pos.amount)
                                if close_qty <= 0: continue

                                actual_price = ev['price'] * (1 - bt_exit_slippage)
                                db.add(Order(position_id=open_bt_pos.id, exchange=exchange_name, bot_name=bot.name, mode="backtest", symbol=symbol, side="sell", order_type="market", price=actual_price, amount=close_qty, timestamp=ts, status="filled"))

                                entry_cost = open_bt_pos.entry_price * close_qty * (1 + bt_entry_fee)
                                exit_proceeds = actual_price * close_qty * (1 - bt_exit_fee)
                                realized_pnl = exit_proceeds - entry_cost
                                open_bt_pos.profit_abs = (open_bt_pos.profit_abs or 0.0) + realized_pnl

                                # Weighted profit_pct: accumulate based on portion of original position closed (fee-adjusted)
                                if original_amount and original_amount > 0:
                                    portion_pct = (realized_pnl / entry_cost) * 100 if entry_cost > 0 else 0.0
                                    weight = close_qty / original_amount
                                    open_bt_pos.profit_pct = (open_bt_pos.profit_pct or 0.0) + (portion_pct * weight)

                                if open_bt_pos.id in self.position_states:
                                    self.position_states[open_bt_pos.id]['triggered_exits'].add(ev['id'])
                                    open_bt_pos.triggered_exits = list(self.position_states[open_bt_pos.id]['triggered_exits'])

                                if close_qty >= open_bt_pos.amount - 0.00001:
                                    open_bt_pos.status = "closed"
                                    open_bt_pos.closed_at = ts
                                    if open_bt_pos.id in self.position_states:
                                        del self.position_states[open_bt_pos.id]
                                    open_bt_pos = None
                                    original_amount = None
                                else:
                                    open_bt_pos.amount -= close_qty

                    if ts not in existing_timestamps:
                        indicators = { col: float(row[col]) for col in evaluator.df.columns if col not in standard_cols and not pd.isna(row[col]) }
                        if indicators:
                            action_str = "buy" if is_buy else ("sell" if is_sell else "neutral")
                            new_signals.append(Signal(candle_id=int(row['id']), symbol=symbol, timestamp=ts, bot_name=bot.name, name="STRATEGY_TICK", action=action_str, extra_data=indicators))

                if run_backtest and open_bt_pos:
                    if live_mode == "forward_test":
                        open_bt_pos.mode = "forward_test"
                        db.query(Order).filter(Order.position_id == open_bt_pos.id).update({"mode": "forward_test"})
                    else:
                        # Close trailing backtest position at last price instead of deleting
                        last_price = float(evaluator.df.iloc[-1]['close'])
                        remaining_qty = open_bt_pos.amount
                        last_ts = evaluator.df.iloc[-1]['timestamp']
                        if last_ts.tzinfo is None: last_ts = last_ts.replace(tzinfo=timezone.utc)

                        entry_cost = open_bt_pos.entry_price * remaining_qty * (1 + bt_entry_fee)
                        exit_proceeds = last_price * remaining_qty * (1 - bt_exit_fee)
                        final_pnl = exit_proceeds - entry_cost

                        open_bt_pos.profit_abs = (open_bt_pos.profit_abs or 0.0) + final_pnl
                        if original_amount and original_amount > 0:
                            portion_pct = (final_pnl / entry_cost) * 100 if entry_cost > 0 else 0.0
                            weight = remaining_qty / original_amount
                            open_bt_pos.profit_pct = (open_bt_pos.profit_pct or 0.0) + (portion_pct * weight)

                        open_bt_pos.status = "closed"
                        open_bt_pos.closed_at = last_ts
                        db.add(Order(position_id=open_bt_pos.id, exchange=exchange_name, bot_name=bot.name, mode="backtest", symbol=symbol, side="sell", order_type="market", price=last_price, amount=remaining_qty, timestamp=last_ts, status="filled"))

                        if open_bt_pos.id in self.position_states:
                            del self.position_states[open_bt_pos.id]

                    open_bt_pos = None

                if new_signals: db.bulk_save_objects(new_signals)
                db.commit()
                logger.info("Backfill complete: '%s' on %s | mode=%s | lookback=%d", bot.name, symbol, live_mode.upper(), lookback_limit)
                blb.push(bot.name, "INFO", f"Backfill complete: {symbol} | mode={live_mode.upper()} | {lookback_limit} candles")

        except Exception as e:
            logger.error("Backfill Error: %s", e, exc_info=True)
            blb.push(_log_name, "ERROR", f"Backfill error: {e}")
            db.rollback()
        finally:
            db.close()

    async def _process_bots(self, exchange: str, symbol: str, timeframe: str):
        def run_logic():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()

                matching_bots = []
                for b in active_bots:
                    syms = b.settings.get("symbols", [])
                    if not syms and b.settings.get("symbol"):
                        syms = [b.settings.get("symbol")]
                    # Match on exchange: derive bot's exchange from its key or data_exchange setting
                    api_key_name = b.settings.get("api_key_name")
                    bot_exchange = b.settings.get("data_exchange", "okx")
                    if api_key_name:
                        key_rec = db.query(ExchangeKey).filter(ExchangeKey.name == api_key_name).first()
                        if key_rec:
                            bot_exchange = key_rec.exchange or bot_exchange
                    if symbol in syms and b.settings.get("timeframe") == timeframe and bot_exchange == exchange:
                        matching_bots.append(b)

                if not matching_bots: return

                max_lookback = max([int(b.settings.get("backtest_lookback", 150)) for b in matching_bots], default=150)

                query = db.query(Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).filter(
                    Candle.exchange == exchange, Candle.symbol == symbol, Candle.timeframe == timeframe
                ).order_by(Candle.timestamp.desc()).limit(max_lookback).statement

                df = pd.read_sql(query, db.bind)

                if df.empty or len(df) < 50:
                    return

                df = df.sort_values('timestamp').reset_index(drop=True)

                for bot in matching_bots:
                    # Max drawdown guard: auto-stop bot if drawdown exceeds threshold
                    max_drawdown_pct = float(bot.settings.get("max_drawdown", 0))
                    if max_drawdown_pct > 0:
                        closed_positions = db.query(Position).filter(
                            Position.bot_name == bot.name, Position.status == "closed"
                        ).order_by(Position.closed_at).all()
                        if closed_positions:
                            peak_pnl = 0.0
                            running_pnl = 0.0
                            max_dd = 0.0
                            for cp in closed_positions:
                                running_pnl += (cp.profit_abs or 0)
                                peak_pnl = max(peak_pnl, running_pnl)
                                if peak_pnl > 0:
                                    dd = ((peak_pnl - running_pnl) / peak_pnl) * 100
                                    max_dd = max(max_dd, dd)
                            if max_dd >= max_drawdown_pct:
                                logger.warning("Bot '%s' hit max drawdown (%.2f%% >= %.2f%%), auto-stopping", bot.name, max_dd, max_drawdown_pct)
                                blb.push(bot.name, "WARN", f"Max drawdown hit ({max_dd:.2f}% >= {max_drawdown_pct:.2f}%), auto-stopping")
                                bot.is_active = False
                                db.commit()
                                continue

                    evaluator = NodeEvaluator(bot.settings)
                    evaluator.df = df.copy()
                    evaluator._calculate_indicators()

                    latest_index = len(evaluator.df) - 1
                    latest_row = evaluator.df.iloc[latest_index]
                    latest_time = latest_row['timestamp']

                    current_price = float(latest_row['close'])
                    current_high = float(latest_row['high'])
                    current_low = float(latest_row['low'])

                    current_atr = float(evaluator.df['atr'].iloc[latest_index]) if 'atr' in evaluator.df.columns and not pd.isna(evaluator.df['atr'].iloc[latest_index]) else 0.0

                    entry_series = evaluator.resolve_node(bot.settings.get("entry_node")) if bot.settings.get("entry_node") else pd.Series(False, index=evaluator.df.index)
                    exit_series = evaluator.resolve_node(bot.settings.get("exit_node")) if bot.settings.get("exit_node") else pd.Series(False, index=evaluator.df.index)

                    is_buy = bool(entry_series.iloc[-1])
                    is_sell = bool(exit_series.iloc[-1])

                    is_api_exec = bot.settings.get("api_execution", False)
                    has_key = bool(bot.settings.get("api_key_name"))
                    mode = "forward_test"
                    api_key_record = None

                    if is_api_exec and has_key:
                        api_key_record = db.query(ExchangeKey).filter(ExchangeKey.name == bot.settings.get("api_key_name")).first()
                        if api_key_record:
                            mode = "paper" if api_key_record.is_sandbox else "live"
                        else:
                            logger.warning("Bot '%s': api_key_name='%s' not found. Running as forward_test.", bot.name, bot.settings.get("api_key_name"))
                            blb.push(bot.name, "WARN", f"API key '{bot.settings.get('api_key_name')}' not found, running as forward_test")

                    # Cache exchange instance per bot cycle to avoid repeated connections
                    _cached_exchange = None
                    def get_exchange():
                        nonlocal _cached_exchange
                        if _cached_exchange is None and api_key_record:
                            _cached_exchange = self._get_ccxt_instance(api_key_record)
                            _cached_exchange.load_markets()
                        return _cached_exchange

                    max_pos = int(bot.settings.get("max_positions", 1))
                    scope = bot.settings.get("max_positions_scope", "per_pair")

                    pos_query = db.query(Position).filter(Position.bot_name == bot.name, Position.status == "open", Position.mode == mode)
                    if scope == "per_pair":
                        pos_query = pos_query.filter(Position.symbol == symbol)

                    open_count = pos_query.count()
                    ccxt_symbol = symbol.replace('-', '/').upper()
                    just_opened_ids = set()

                    # Cooldown check: block entry if too many trades occurred within the cooldown window
                    tf_seconds = 60
                    if timeframe.endswith('m'): tf_seconds = int(timeframe[:-1]) * 60
                    elif timeframe.endswith('h'): tf_seconds = int(timeframe[:-1]) * 3600
                    elif timeframe.endswith('d'): tf_seconds = int(timeframe[:-1]) * 86400

                    cooldown_trades = int(bot.settings.get("cooldown_trades", 0))
                    cooldown_candles = int(bot.settings.get("cooldown_candles", 0))

                    can_buy_cooldown = True
                    if cooldown_trades > 0 and cooldown_candles > 0:
                        safe_latest_time = latest_time
                        if safe_latest_time.tzinfo is None:
                            safe_latest_time = safe_latest_time.replace(tzinfo=timezone.utc)

                        threshold_time = safe_latest_time - timedelta(seconds=cooldown_candles * tf_seconds)
                        recent_buys = db.query(Order).filter(
                            Order.bot_name == bot.name,
                            Order.symbol == symbol,
                            Order.mode == mode,
                            Order.side == "buy",
                            Order.timestamp > threshold_time
                        ).count()
                        if recent_buys >= cooldown_trades:
                            can_buy_cooldown = False

                    if is_buy and open_count < max_pos and can_buy_cooldown:
                        trade_amount = self._calculate_trade_amount(current_price, bot.settings)
                        if trade_amount is None:
                            logger.warning("Skipping buy for %s: invalid trade amount", symbol)
                        else:
                            try:
                                actual_price = current_price
                                order_id = f"local_{int(latest_time.timestamp())}_{uuid.uuid4().hex[:8]}"

                                buy_fee = 0.0
                                if mode in ["paper", "live"] and api_key_record:
                                    exchange = get_exchange()
                                    trade_amount = float(exchange.amount_to_precision(ccxt_symbol, trade_amount))
                                    if trade_amount <= 0:
                                        logger.warning("Trade amount rounded to zero for %s after precision, skipping", ccxt_symbol)
                                        continue
                                    # Safety guard: reject orders exceeding max_order_value
                                    max_order_usd = float(bot.settings.get("max_order_value", 0))
                                    if mode == "live" and max_order_usd > 0:
                                        order_value_usd = trade_amount * current_price
                                        if order_value_usd > max_order_usd:
                                            logger.warning("SAFETY: BUY order $%.2f exceeds max_order_value $%.2f for %s. Skipping.", order_value_usd, max_order_usd, symbol)
                                            continue
                                    okx_order = exchange.create_market_buy_order(ccxt_symbol, trade_amount)
                                    logger.info("%s BUY response: id=%s status=%s filled=%s avg=%s fee=%s",
                                        mode.upper(), okx_order.get("id"), okx_order.get("status"),
                                        okx_order.get("filled"), okx_order.get("average"), okx_order.get("fee"))
                                    if okx_order.get("status") != "closed":
                                        logger.warning("%s BUY not fully filled (status=%s). Recording as canceled.", mode.upper(), okx_order.get("status"))
                                        db.add(Order(bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, exchange_order_id=okx_order.get("id"), status="canceled"))
                                        continue
                                    actual_price = okx_order.get("average") or current_price
                                    order_id = okx_order.get("id")
                                    if okx_order.get("fee"):
                                        buy_fee = float(okx_order["fee"].get("cost", 0) or 0)

                                # Position created after successful exchange order
                                open_position = Position(exchange=exchange, bot_name=bot.name, symbol=symbol, mode=mode, status="open", side="long", entry_price=actual_price, amount=trade_amount)
                                db.add(open_position)
                                db.flush()
                                just_opened_ids.add(open_position.id)

                                db.add(Order(position_id=open_position.id, exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=actual_price, amount=trade_amount, timestamp=latest_time, exchange_order_id=order_id, status="filled", fee=buy_fee))
                                logger.info("%s BUY Filled @ %s", mode.upper(), actual_price)
                                blb.push(bot.name, "INFO", f"{mode.upper()} BUY {symbol} @ {actual_price}")

                            except ccxt.InsufficientFunds as e:
                                logger.warning("%s BUY rejected (insufficient funds): %s", mode.upper(), e)
                                blb.push(bot.name, "WARN", f"{mode.upper()} BUY rejected: insufficient funds")
                                db.add(Order(exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, status="rejected"))
                            except Exception as e:
                                logger.error("%s BUY failed: %s", mode.upper(), e, exc_info=True)
                                blb.push(bot.name, "ERROR", f"{mode.upper()} BUY failed: {e}")
                                db.add(Order(exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, status="canceled"))

                    active_positions = db.query(Position).filter(Position.bot_name == bot.name, Position.symbol == symbol, Position.status == "open", Position.mode == mode).all()

                    for pos in active_positions:
                        if pos.id in just_opened_ids: continue

                        exit_events = self._check_exits(pos, current_price, current_high, current_low, is_sell, bot.settings, current_atr)

                        # Track original amount for weighted profit_pct
                        # Use the sum of all buy orders as the original position size
                        pos_original_amount = sum(
                            o.amount for o in (pos.orders or []) if o.side == "buy" and o.status == "filled"
                        ) or pos.amount

                        for ev in exit_events:
                            if pos.amount <= 0: break

                            if ev.get('close_amount_type') == 'fixed':
                                close_qty = min(ev['qty_pct'], pos.amount)
                            else:
                                close_qty = pos.amount * (ev['qty_pct'] / 100)
                            close_qty = min(close_qty, pos.amount)
                            if close_qty <= 0: continue

                            try:
                                actual_price = ev['price']
                                order_id = f"local_{int(latest_time.timestamp())}_{uuid.uuid4().hex[:8]}"

                                actual_fee = 0.0
                                if mode in ["paper", "live"] and api_key_record:
                                    exchange = get_exchange()
                                    close_qty = float(exchange.amount_to_precision(ccxt_symbol, close_qty))
                                    if close_qty <= 0:
                                        logger.warning("Sell amount rounded to zero for %s after precision, skipping", ccxt_symbol)
                                        continue
                                    okx_order = exchange.create_market_sell_order(ccxt_symbol, close_qty)
                                    logger.info("%s SELL response: id=%s status=%s filled=%s avg=%s fee=%s",
                                        mode.upper(), okx_order.get("id"), okx_order.get("status"),
                                        okx_order.get("filled"), okx_order.get("average"), okx_order.get("fee"))
                                    if okx_order.get("status") != "closed":
                                        logger.warning("%s SELL not fully filled (status=%s). Recording as canceled.", mode.upper(), okx_order.get("status"))
                                        db.add(Order(position_id=pos.id, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=ev['price'], amount=close_qty, timestamp=latest_time, exchange_order_id=okx_order.get("id"), status="canceled"))
                                        continue
                                    actual_price = okx_order.get("average") or ev['price']
                                    order_id = okx_order.get("id")
                                    if okx_order.get("fee"):
                                        actual_fee = float(okx_order["fee"].get("cost", 0) or 0)

                                db.add(Order(position_id=pos.id, exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=actual_price, amount=close_qty, timestamp=latest_time, exchange_order_id=order_id, status="filled", fee=actual_fee))

                                # Fee-adjusted P&L: subtract proportional entry fee + exit fee
                                total_buy_fees = sum((o.fee or 0.0) for o in (pos.orders or []) if o.side == "buy" and o.status == "filled")
                                entry_fee_portion = total_buy_fees * (close_qty / pos_original_amount) if pos_original_amount > 0 else 0.0
                                realized_pnl = (actual_price - pos.entry_price) * close_qty - entry_fee_portion - actual_fee
                                pos.profit_abs = (pos.profit_abs or 0.0) + realized_pnl

                                # Weighted profit_pct: fee-adjusted, based on portion of original position
                                if pos_original_amount > 0:
                                    entry_cost_for_qty = pos.entry_price * close_qty + entry_fee_portion
                                    portion_pct = (realized_pnl / entry_cost_for_qty) * 100 if entry_cost_for_qty > 0 else 0.0
                                    weight = close_qty / pos_original_amount
                                    pos.profit_pct = (pos.profit_pct or 0.0) + (portion_pct * weight)

                                if pos.id in self.position_states:
                                    self.position_states[pos.id]['triggered_exits'].add(ev['id'])
                                    pos.triggered_exits = list(self.position_states[pos.id]['triggered_exits'])

                                if close_qty >= pos.amount - 0.00001:
                                    pos.status = "closed"
                                    pos.closed_at = latest_time
                                    if pos.id in self.position_states:
                                        del self.position_states[pos.id]
                                else:
                                    pos.amount -= close_qty

                                logger.info("%s SELL (%s) Filled @ %s", mode.upper(), ev['reason'], actual_price)
                                blb.push(bot.name, "INFO", f"{mode.upper()} SELL [{ev['reason']}] {symbol} @ {actual_price}")
                            except Exception as e:
                                logger.error("%s SELL failed: %s", mode.upper(), e, exc_info=True)
                                blb.push(bot.name, "ERROR", f"{mode.upper()} SELL failed: {e}")
                                db.add(Order(position_id=pos.id, exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=current_price, amount=close_qty, timestamp=latest_time, status="rejected"))

                    standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'atr']
                    indicators = { col: float(latest_row[col]) for col in evaluator.df.columns if col not in standard_cols and not pd.isna(latest_row[col]) }

                    existing_signal = db.query(Signal).filter(Signal.bot_name == bot.name, Signal.symbol == symbol, Signal.timestamp == latest_time).first()
                    if not existing_signal and indicators:
                        action_str = "buy" if is_buy else ("sell" if is_sell else "neutral")
                        db.add(Signal(candle_id=int(latest_row['id']), symbol=symbol, timestamp=latest_time, bot_name=bot.name, name="STRATEGY_TICK", action=action_str, extra_data=indicators))
                        db.commit()

            except Exception as e:
                logger.error("Error executing live bot strategy: %s", e, exc_info=True)
                db.rollback()
            finally:
                db.close()

        await asyncio.to_thread(run_logic)

    def stop(self):
        self.running = False
        logger.info("Bot Manager stopped.")

bot_manager = BotManager()
