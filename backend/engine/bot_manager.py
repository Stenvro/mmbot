import asyncio
import time
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

class BotManager:
    def __init__(self):
        self.running = False
        self.position_states = {} 

    async def start(self):
        self.running = True
        print("🤖 Bot Manager started. Engine is fully operational.")
        
        asyncio.create_task(self._startup_backfill())
        asyncio.create_task(self._listen_for_bot_starts())
        
        queue = event_bus.subscribe("CANDLE_CLOSED")
        while self.running:
            try:
                event_data = await asyncio.wait_for(queue.get(), timeout=1.0)
                symbol = event_data["symbol"]
                timeframe = event_data["timeframe"]
                asyncio.create_task(self._process_bots(symbol, timeframe))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    def _get_ccxt_instance(self, api_key_record: ExchangeKey):
        dec_key = decrypt_data(api_key_record.api_key)
        dec_secret = decrypt_data(api_key_record.api_secret)
        dec_passphrase = decrypt_data(api_key_record.passphrase)
        
        exchange = ccxt.okx({
            'apiKey': dec_key,
            'secret': dec_secret,
            'password': dec_passphrase,
            'enableRateLimit': True,
            'hostname': 'eea.okx.com'
        })
        if api_key_record.is_sandbox:
            exchange.set_sandbox_mode(True)
        return exchange

    def _calculate_trade_amount(self, current_price, bot_settings):
        entry_settings = bot_settings.get("trade_settings", {}).get("entry", {})
        amount_type = entry_settings.get("amount_type", "percentage")
        raw_val = entry_settings.get("amount_value")
        
        amount_value = float(raw_val) if raw_val and float(raw_val) > 0 else 100.0
        
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
            self.position_states[open_position.id] = {
                'entry_price': open_position.entry_price,
                'highest_price': max(open_position.entry_price, row_high),
                'triggered_exits': set()
            }
            state = self.position_states[open_position.id]
        else:
            state['highest_price'] = max(state['highest_price'], row_high)

        sl_hit = False
        for i, sl in enumerate(entry_settings.get("stop_losses", [])):
            sl_id = f"sl_{i}"
            if sl_id in state['triggered_exits']: continue

            try: sl_val = float(sl.get('value', 0))
            except: continue
            
            if sl_val <= 0: continue

            if sl['type'] == 'percentage':
                trigger_price = open_position.entry_price * (1 - (sl_val/100))
            elif sl['type'] == 'trailing':
                trigger_price = state['highest_price'] * (1 - (sl_val/100))
            elif sl['type'] == 'atr':
                if current_atr <= 0: continue 
                trigger_price = state['highest_price'] - (sl_val * current_atr)
            else:
                trigger_price = sl_val
            
            if row_low <= trigger_price:
                pct_to_close = float(sl.get('close_amount_value', 100))
                events.append({
                    'qty_pct': pct_to_close,
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
                
                try: tp_val = float(tp.get('value', 0))
                except: continue
                
                if tp_val <= 0: continue
                
                if tp['type'] == 'percentage':
                    t_price = open_position.entry_price * (1 + (tp_val/100))
                    if row_high >= t_price:
                        tps.append({'id': tp_id, 'price': t_price, 'pct': float(tp.get('close_amount_value', 100))})
                elif tp['type'] == 'trailing':
                    t_price = state['highest_price'] * (1 - (tp_val/100))
                    if row_low <= t_price:
                        tps.append({'id': tp_id, 'price': t_price, 'pct': float(tp.get('close_amount_value', 100))})
                elif tp['type'] == 'atr':
                    if current_atr <= 0: continue
                    t_price = state['highest_price'] - (tp_val * current_atr)
                    if row_low <= t_price:
                        tps.append({'id': tp_id, 'price': t_price, 'pct': float(tp.get('close_amount_value', 100))})
                else: 
                    t_price = tp_val
                    if row_high >= t_price:
                        tps.append({'id': tp_id, 'price': t_price, 'pct': float(tp.get('close_amount_value', 100))})
            
            tps = sorted(tps, key=lambda x: x['price'], reverse=True)
            
            for tp in tps:
                events.append({
                    'qty_pct': tp['pct'],
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
            print(f"Error during thread backfill: {e}")

    def _execute_sync_backfill(self, bot_id: int):
        db = SessionLocal()
        try:
            bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
            if not bot or not bot.is_active: return
            
            is_api_exec = bot.settings.get("api_execution", False)
            has_key = bool(bot.settings.get("api_key_name"))
            
            live_mode = "forward_test"
            if is_api_exec and has_key:
                api_key = db.query(ExchangeKey).filter(ExchangeKey.name == bot.settings.get("api_key_name")).first()
                if api_key: live_mode = "paper" if api_key.is_sandbox else "live"

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
                
                initial_count = db.query(Candle.id).filter(Candle.symbol == symbol, Candle.timeframe == timeframe).count()
                print(f"BotManager: Waiting for sufficient candle data for {symbol} (currently {initial_count} candles)...")
                last_count = -1
                stagnant_checks = 0
                
                while True:
                    current_count = db.query(Candle.id).filter(Candle.symbol == symbol, Candle.timeframe == timeframe).count()
                    
                    if current_count >= lookback_limit:
                        print(f"BotManager: Sufficient data available for {symbol} ({current_count}/{lookback_limit}).")
                        break
                        
                    if current_count == last_count:
                        stagnant_checks += 1
                        max_stagnant = 8 if current_count == initial_count else 2
                        
                        if stagnant_checks >= max_stagnant:
                            print(f"BotManager: Data ingestion stalled for {symbol} at {current_count} candles. Proceeding with available data.")
                            break
                    else:
                        stagnant_checks = 0 
                        
                    last_count = current_count
                    time.sleep(5)

                for _ in range(20):
                    latest_candle = db.query(Candle.timestamp).filter(
                        Candle.symbol == symbol, Candle.timeframe == timeframe
                    ).order_by(Candle.timestamp.desc()).first()
                    
                    if latest_candle:
                        candle_ts = latest_candle[0]
                        if candle_ts.tzinfo is None: candle_ts = candle_ts.replace(tzinfo=timezone.utc)
                        diff_seconds = datetime.now(timezone.utc).timestamp() - candle_ts.timestamp()
                        if diff_seconds <= (tf_seconds * 2): break
                    time.sleep(1)

                query = db.query(Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe
                ).order_by(Candle.timestamp.desc()).limit(lookback_limit).statement
                
                df = pd.read_sql(query, db.bind)
                
                if df.empty or len(df) < 50:
                    print(f"Skipping backfill for {symbol}: insufficient data ({len(df)} candles, minimum 50 required).")
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
                            trade_entry_indices.append(index)
                            trade_amount = self._calculate_trade_amount(current_price, bot.settings)
                            open_bt_pos = Position(bot_name=bot.name, symbol=symbol, mode="backtest", status="open", side="long", entry_price=current_price, amount=trade_amount)
                            db.add(open_bt_pos)
                            db.flush() 
                            db.add(Order(position_id=open_bt_pos.id, bot_name=bot.name, mode="backtest", symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=ts, status="filled"))
                            just_opened_this_tick = True

                        elif open_bt_pos and not just_opened_this_tick:
                            exit_events = self._check_exits(open_bt_pos, current_price, current_high, current_low, is_sell, bot.settings, current_atr)
                            
                            for ev in exit_events:
                                if open_bt_pos is None: break
                                
                                close_qty = open_bt_pos.amount * (ev['qty_pct'] / 100)
                                close_qty = min(close_qty, open_bt_pos.amount)
                                if close_qty <= 0: continue

                                actual_price = ev['price']
                                db.add(Order(position_id=open_bt_pos.id, bot_name=bot.name, mode="backtest", symbol=symbol, side="sell", order_type="market", price=actual_price, amount=close_qty, timestamp=ts, status="filled"))
                                
                                realized_pnl = (actual_price - open_bt_pos.entry_price) * close_qty
                                open_bt_pos.profit_abs = (open_bt_pos.profit_abs or 0.0) + realized_pnl
                                open_bt_pos.profit_pct = ((actual_price - open_bt_pos.entry_price) / open_bt_pos.entry_price) * 100
                                
                                if open_bt_pos.id in self.position_states:
                                    self.position_states[open_bt_pos.id]['triggered_exits'].add(ev['id'])
                                
                                if close_qty >= open_bt_pos.amount - 0.00001:
                                    open_bt_pos.status = "closed"
                                    open_bt_pos.closed_at = ts
                                    if open_bt_pos.id in self.position_states:
                                        del self.position_states[open_bt_pos.id]
                                    open_bt_pos = None 
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
                        db.query(Order).filter(Order.position_id == open_bt_pos.id).delete(synchronize_session=False)
                        db.delete(open_bt_pos)
                        if open_bt_pos.id in self.position_states:
                            del self.position_states[open_bt_pos.id]
                    
                    open_bt_pos = None

                if new_signals: db.bulk_save_objects(new_signals)
                db.commit()
                print(f"Backfill complete: '{bot.name}' on {symbol} | mode={live_mode.upper()} | lookback={lookback_limit}")

        except Exception as e:
            print(f"❌ Backfill Error: {e}")
            db.rollback()
        finally:
            db.close()

    async def _process_bots(self, symbol: str, timeframe: str):
        def run_logic():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
                
                matching_bots = []
                for b in active_bots:
                    syms = b.settings.get("symbols", [])
                    if not syms and b.settings.get("symbol"):
                        syms = [b.settings.get("symbol")]
                    if symbol in syms and b.settings.get("timeframe") == timeframe:
                        matching_bots.append(b)

                if not matching_bots: return

                max_lookback = max([int(b.settings.get("backtest_lookback", 150)) for b in matching_bots], default=150)

                query = db.query(Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe
                ).order_by(Candle.timestamp.desc()).limit(max_lookback).statement
                
                df = pd.read_sql(query, db.bind)
                
                if df.empty or len(df) < 50: 
                    return
                
                df = df.sort_values('timestamp').reset_index(drop=True)

                for bot in matching_bots:
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
                        
                        try:
                            actual_price = current_price
                            order_id = f"local_{int(latest_time.timestamp())}"
                            
                            if mode in ["paper", "live"] and api_key_record:
                                exchange = self._get_ccxt_instance(api_key_record)
                                okx_order = exchange.create_market_buy_order(ccxt_symbol, trade_amount)
                                actual_price = okx_order.get("average") or current_price
                                order_id = okx_order.get("id")
                            
                            open_position = Position(bot_name=bot.name, symbol=symbol, mode=mode, status="open", side="long", entry_price=actual_price, amount=trade_amount)
                            db.add(open_position)
                            db.flush()
                            just_opened_ids.add(open_position.id)
                            
                            db.add(Order(position_id=open_position.id, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=actual_price, amount=trade_amount, timestamp=latest_time, exchange_order_id=order_id, status="filled"))
                            print(f"✅ {mode.upper()} BUY Filled @ {actual_price}")

                        except ccxt.InsufficientFunds as e:
                            db.add(Order(bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, status="rejected"))
                        except Exception as e:
                            db.add(Order(bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, status="canceled"))

                    active_positions = db.query(Position).filter(Position.bot_name == bot.name, Position.symbol == symbol, Position.status == "open", Position.mode == mode).all()
                    
                    for pos in active_positions:
                        if pos.id in just_opened_ids: continue 
                            
                        exit_events = self._check_exits(pos, current_price, current_high, current_low, is_sell, bot.settings, current_atr)

                        for ev in exit_events:
                            if pos.amount <= 0: break
                            
                            close_qty = pos.amount * (ev['qty_pct'] / 100)
                            close_qty = min(close_qty, pos.amount)
                            if close_qty <= 0: continue
                            
                            try:
                                actual_price = ev['price']
                                order_id = f"local_{int(latest_time.timestamp())}"
                                
                                if mode in ["paper", "live"] and api_key_record:
                                    exchange = self._get_ccxt_instance(api_key_record)
                                    okx_order = exchange.create_market_sell_order(ccxt_symbol, close_qty)
                                    actual_price = okx_order.get("average") or ev['price']
                                    order_id = okx_order.get("id")
                                
                                db.add(Order(position_id=pos.id, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=actual_price, amount=close_qty, timestamp=latest_time, exchange_order_id=order_id, status="filled"))
                                
                                realized_pnl = (actual_price - pos.entry_price) * close_qty
                                pos.profit_abs = (pos.profit_abs or 0.0) + realized_pnl
                                pos.profit_pct = ((actual_price - pos.entry_price) / pos.entry_price) * 100

                                if pos.id in self.position_states:
                                    self.position_states[pos.id]['triggered_exits'].add(ev['id'])

                                if close_qty >= pos.amount - 0.00001:
                                    pos.status = "closed"
                                    pos.closed_at = latest_time
                                    if pos.id in self.position_states:
                                        del self.position_states[pos.id]
                                else:
                                    pos.amount -= close_qty

                                print(f"✅ {mode.upper()} SELL ({ev['reason']}) Filled @ {actual_price}")
                            except Exception as e:
                                db.add(Order(position_id=pos.id, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=current_price, amount=close_qty, timestamp=latest_time, status="rejected"))

                    standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'atr']
                    indicators = { col: float(latest_row[col]) for col in evaluator.df.columns if col not in standard_cols and not pd.isna(latest_row[col]) }

                    existing_signal = db.query(Signal).filter(Signal.bot_name == bot.name, Signal.symbol == symbol, Signal.timestamp == latest_time).first()
                    if not existing_signal and indicators:
                        action_str = "buy" if is_buy else ("sell" if is_sell else "neutral")
                        db.add(Signal(candle_id=int(latest_row['id']), symbol=symbol, timestamp=latest_time, bot_name=bot.name, name="STRATEGY_TICK", action=action_str, extra_data=indicators))
                        db.commit()

            except Exception as e:
                print(f"❌ Error executing live bot strategy: {e}")
                db.rollback()
            finally:
                db.close()
                
        await asyncio.to_thread(run_logic)

    def stop(self):
        self.running = False
        print("🤖 Bot Manager stopped.")

bot_manager = BotManager()