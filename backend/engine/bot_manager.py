import asyncio
import pandas as pd
import ccxt
from sqlalchemy.orm import Session
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

    async def start(self):
        self.running = True
        print("🤖 Bot Manager started. Listening for events...")
        
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
        })
        if api_key_record.is_sandbox:
            exchange.set_sandbox_mode(True)
        return exchange

    def _calculate_trade_amount(self, current_price, bot_settings):
        """Berekent de entry size op basis van de Visual Builder settings"""
        entry_settings = bot_settings.get("trade_settings", {}).get("entry", {})
        amount_type = entry_settings.get("amount_type", "percentage")
        amount_value = float(entry_settings.get("amount_value", 100))
        
        if amount_type == "fixed":
            return amount_value
        else:
            # Percentage van kapitaal (gebruik backtest_capital of een default van 1000 USDT)
            capital = float(bot_settings.get("backtest_capital", 1000))
            investment = capital * (amount_value / 100)
            return investment / current_price

    def _check_exits(self, open_position, current_price, is_sell_signal, bot_settings):
        """Controleert TP, SL en Strategy Exits, inclusief Partial Closes"""
        trade_settings = bot_settings.get("trade_settings", {})
        entry_settings = trade_settings.get("entry", {})
        
        close_triggered = False
        close_qty = 0
        close_reason = None

        # 1. Check Stop Losses (Rode Blokken)
        for sl in entry_settings.get("stop_losses", []):
            trigger_price = open_position.entry_price * (1 - (float(sl['value'])/100)) if sl['type'] == 'percentage' else float(sl['value'])
            if current_price <= trigger_price:
                close_triggered = True
                pct_to_close = float(sl.get('close_amount_value', 100))
                close_qty = open_position.amount * (pct_to_close / 100)
                close_reason = "stop_loss"
                break
                
        # 2. Check Take Profits (Groene Blokken)
        if not close_triggered:
            for tp in entry_settings.get("take_profits", []):
                trigger_price = open_position.entry_price * (1 + (float(tp['value'])/100)) if tp['type'] == 'percentage' else float(tp['value'])
                if current_price >= trigger_price:
                    close_triggered = True
                    pct_to_close = float(tp.get('close_amount_value', 100))
                    close_qty = open_position.amount * (pct_to_close / 100)
                    close_reason = "take_profit"
                    break
                    
        # 3. Check Standaard Strategy Exit (S-S Signaal)
        if not close_triggered and is_sell_signal:
            close_triggered = True
            exit_settings = trade_settings.get("exit", {})
            pct_to_close = float(exit_settings.get('amount_value', 100)) if exit_settings.get('amount_type') == 'percentage' else 100
            close_qty = open_position.amount * (pct_to_close / 100)
            close_reason = "strategy"

        return close_triggered, close_qty, close_reason

    async def _startup_backfill(self):
        def run():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
                for bot in active_bots:
                    asyncio.run_coroutine_threadsafe(self._backfill_bot(bot.id), asyncio.get_running_loop())
            finally:
                db.close()
        await asyncio.to_thread(run)

    async def _listen_for_bot_starts(self):
        queue = event_bus.subscribe("BOT_STATE_CHANGED")
        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                if event["action"] == "started":
                    asyncio.create_task(self._backfill_bot(event["bot_id"]))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def _backfill_bot(self, bot_id: int):
        def run_backfill():
            db = SessionLocal()
            try:
                bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
                if not bot or not bot.is_active: return
                
                # Check Execution Mode
                is_api_exec = bot.settings.get("api_execution", False)
                has_key = bool(bot.settings.get("api_key_name"))
                live_mode = "paper" # Default is paper/forward test
                
                if is_api_exec and has_key:
                    api_key = db.query(ExchangeKey).filter(ExchangeKey.name == bot.settings.get("api_key_name")).first()
                    if api_key: live_mode = "paper" if api_key.is_sandbox else "live"

                symbol = bot.settings.get("symbol")
                timeframe = bot.settings.get("timeframe")
                exit_node = bot.settings.get("exit_node")
                run_backtest = bot.settings.get("backtest_on_start", False)

                query = db.query(Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe
                ).order_by(Candle.timestamp.asc()).statement
                
                df = pd.read_sql(query, db.bind)
                if df.empty: return

                evaluator = NodeEvaluator(bot.settings)
                evaluator.df = df.copy()
                evaluator._calculate_indicators() 

                existing_timestamps = {s[0] for s in db.query(Signal.timestamp).filter(Signal.bot_name == bot.name).all()}
                
                # --- STATE RECOVERY ---
                open_bt_pos = None
                last_bt_ts = None
                
                if run_backtest:
                    last_order = db.query(Order).filter(Order.bot_name == bot.name, Order.mode == "backtest").order_by(Order.timestamp.desc()).first()
                    if last_order: last_bt_ts = last_order.timestamp
                    open_bt_pos = db.query(Position).filter(Position.bot_name == bot.name, Position.mode == "backtest", Position.status == "open").first()

                new_signals = []
                standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume']

                for index, row in evaluator.df.iterrows():
                    ts = row['timestamp']
                    current_price = float(row['close'])
                    
                    try: is_buy = bool(evaluator.resolve_node(bot.settings.get("entry_node"), index))
                    except Exception: is_buy = False
                    
                    try: is_sell = bool(evaluator.resolve_node(exit_node, index)) if exit_node else False
                    except Exception: is_sell = False

                    # --- BACKTEST TRADE LOGICA ---
                    if run_backtest and (last_bt_ts is None or ts > last_bt_ts):
                        
                        if is_buy and not open_bt_pos:
                            trade_amount = self._calculate_trade_amount(current_price, bot.settings)
                            open_bt_pos = Position(bot_name=bot.name, symbol=symbol, mode="backtest", status="open", side="long", entry_price=current_price, amount=trade_amount)
                            db.add(open_bt_pos)
                            db.flush() 
                            db.add(Order(position_id=open_bt_pos.id, bot_name=bot.name, mode="backtest", symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=ts, status="filled"))

                        elif open_bt_pos:
                            close_triggered, close_qty, close_reason = self._check_exits(open_bt_pos, current_price, is_sell, bot.settings)
                            
                            if close_triggered and close_qty > 0:
                                # Voorkom dat we meer sluiten dan we hebben
                                close_qty = min(close_qty, open_bt_pos.amount)
                                
                                db.add(Order(position_id=open_bt_pos.id, bot_name=bot.name, mode="backtest", symbol=symbol, side="sell", order_type="market", price=current_price, amount=close_qty, timestamp=ts, status="filled"))
                                
                                open_bt_pos.amount -= close_qty
                                
                                # Als de positie leeg is, sluit hem
                                if open_bt_pos.amount <= 0.00001:
                                    open_bt_pos.status = "closed"
                                    open_bt_pos.closed_at = ts
                                    open_bt_pos.profit_abs = (current_price - open_bt_pos.entry_price) * open_bt_pos.amount
                                    open_bt_pos.profit_pct = ((current_price - open_bt_pos.entry_price) / open_bt_pos.entry_price) * 100
                                    open_bt_pos = None 

                    # --- SIGNALEN ---
                    if ts not in existing_timestamps:
                        indicators = { col: float(row[col]) for col in evaluator.df.columns if col not in standard_cols and not pd.isna(row[col]) }
                        if indicators:
                            action_str = "buy" if is_buy else ("sell" if is_sell else "neutral")
                            new_signals.append(Signal(candle_id=int(row['id']), symbol=symbol, timestamp=ts, bot_name=bot.name, name="STRATEGY_TICK", action=action_str, extra_data=indicators))

                if new_signals: db.bulk_save_objects(new_signals)
                db.commit()
                print(f"✅ Sync Complete: '{bot.name}' (Target Mode: {live_mode.upper()})")

            except Exception as e:
                print(f"❌ Backfill Error: {e}")
                db.rollback()
            finally:
                db.close()
        await asyncio.to_thread(run_backfill)

    async def _process_bots(self, symbol: str, timeframe: str):
        """LIVE ENGINE: API Executie, Forward Testing & Partial Closes."""
        def run_logic():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
                matching_bots = [b for b in active_bots if b.settings.get("symbol") == symbol and b.settings.get("timeframe") == timeframe]
                if not matching_bots: return

                query = db.query(Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe
                ).order_by(Candle.timestamp.desc()).limit(150).statement
                
                df = pd.read_sql(query, db.bind)
                if df.empty: return
                df = df.sort_values('timestamp').reset_index(drop=True)

                for bot in matching_bots:
                    evaluator = NodeEvaluator(bot.settings)
                    evaluator.df = df.copy()
                    evaluator._calculate_indicators()
                    
                    latest_index = len(evaluator.df) - 1
                    latest_row = evaluator.df.iloc[latest_index]
                    latest_time = latest_row['timestamp']
                    current_price = float(latest_row['close'])

                    try: is_buy = bool(evaluator.resolve_node(bot.settings.get("entry_node"), latest_index))
                    except Exception: is_buy = False
                    
                    try: 
                        exit_node = bot.settings.get("exit_node")
                        is_sell = bool(evaluator.resolve_node(exit_node, latest_index)) if exit_node else False
                    except Exception: is_sell = False

                    # --- NETWERK MODUS BEPALEN ---
                    is_api_exec = bot.settings.get("api_execution", False)
                    has_key = bool(bot.settings.get("api_key_name"))
                    mode = "forward_test" # Default
                    api_key_record = None

                    if is_api_exec and has_key:
                        api_key_record = db.query(ExchangeKey).filter(ExchangeKey.name == bot.settings.get("api_key_name")).first()
                        if api_key_record:
                            mode = "paper" if api_key_record.is_sandbox else "live"

                    # --- LIVE / FORWARD TEST EXECUTIE ---
                    open_position = db.query(Position).filter(
                        Position.bot_name == bot.name, Position.status == "open", Position.mode == mode
                    ).first()
                    
                    ccxt_symbol = symbol.replace('-', '/').upper()

                    if is_buy and not open_position:
                        trade_amount = self._calculate_trade_amount(current_price, bot.settings)
                        
                        try:
                            actual_price = current_price
                            order_id = f"local_{int(latest_time.timestamp())}"
                            
                            # Echte API Call alleen als mode paper of live is
                            if mode in ["paper", "live"] and api_key_record:
                                exchange = self._get_ccxt_instance(api_key_record)
                                print(f"📡 Sending LIVE BUY order for {trade_amount} {ccxt_symbol}...")
                                okx_order = exchange.create_market_buy_order(ccxt_symbol, trade_amount)
                                actual_price = okx_order.get("average") or current_price
                                order_id = okx_order.get("id")
                            
                            # Registreer Positie (Geldt voor Exchange én Forward Testing)
                            open_position = Position(bot_name=bot.name, symbol=symbol, mode=mode, status="open", side="long", entry_price=actual_price, amount=trade_amount)
                            db.add(open_position)
                            db.flush()
                            
                            db.add(Order(position_id=open_position.id, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=actual_price, amount=trade_amount, timestamp=latest_time, exchange_order_id=order_id, status="filled"))
                            print(f"✅ {mode.upper()} BUY Filled @ {actual_price}")

                        except ccxt.InsufficientFunds as e:
                            db.add(Order(bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, status="rejected"))
                        except Exception as e:
                            db.add(Order(bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, status="canceled"))

                    elif open_position:
                        close_triggered, close_qty, close_reason = self._check_exits(open_position, current_price, is_sell, bot.settings)

                        if close_triggered and close_qty > 0:
                            close_qty = min(close_qty, open_position.amount)
                            
                            try:
                                actual_price = current_price
                                order_id = f"local_{int(latest_time.timestamp())}"
                                
                                if mode in ["paper", "live"] and api_key_record:
                                    exchange = self._get_ccxt_instance(api_key_record)
                                    print(f"📡 Sending LIVE SELL order for {close_qty} {ccxt_symbol}...")
                                    okx_order = exchange.create_market_sell_order(ccxt_symbol, close_qty)
                                    actual_price = okx_order.get("average") or current_price
                                    order_id = okx_order.get("id")
                                
                                db.add(Order(position_id=open_position.id, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=actual_price, amount=close_qty, timestamp=latest_time, exchange_order_id=order_id, status="filled"))
                                print(f"✅ {mode.upper()} SELL ({close_reason}) Filled @ {actual_price}")
                                
                                open_position.amount -= close_qty

                                if open_position.amount <= 0.00001:
                                    open_position.status = "closed"
                                    open_position.closed_at = latest_time
                                    open_position.profit_abs = (actual_price - open_position.entry_price) * open_position.amount
                                    open_position.profit_pct = ((actual_price - open_position.entry_price) / open_position.entry_price) * 100

                            except Exception as e:
                                db.add(Order(position_id=open_position.id, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=current_price, amount=close_qty, timestamp=latest_time, status="rejected"))

                    # --- SIGNAAL TEKENEN (Altijd) ---
                    standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume']
                    indicators = { col: float(latest_row[col]) for col in evaluator.df.columns if col not in standard_cols and not pd.isna(latest_row[col]) }

                    existing_signal = db.query(Signal).filter(Signal.bot_name == bot.name, Signal.timestamp == latest_time).first()
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