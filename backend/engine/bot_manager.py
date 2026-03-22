import asyncio
import pandas as pd
from sqlalchemy.orm import Session
from backend.core.database import SessionLocal
from backend.models.bots import BotConfig
from backend.models.candles import Candle
from backend.models.signals import Signal
from backend.models.orders import Order
from backend.models.positions import Position
from backend.engine.evaluator import NodeEvaluator
from backend.core.events import event_bus

class BotManager:
    def __init__(self):
        self.running = False

    async def start(self):
        self.running = True
        print("🤖 Bot Manager started. Listening for events...")
        
        # 1. CRASH RECOVERY: Check of er bots aan stonden voor de VM uitviel
        asyncio.create_task(self._startup_backfill())
        
        # 2. Luister naar handmatige start/stop kliks uit de UI
        asyncio.create_task(self._listen_for_bot_starts())
        
        # 3. Luister naar nieuwe live kaarsen
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

    async def _startup_backfill(self):
        """Wordt 1x uitgevoerd bij het opstarten van de backend om VM crashes op te vangen."""
        def run():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
                for bot in active_bots:
                    print(f"🔄 Recovered active bot '{bot.name}' after restart. Triggering historical backfill...")
                    asyncio.run_coroutine_threadsafe(self._backfill_bot(bot.id), asyncio.get_running_loop())
            finally:
                db.close()
        await asyncio.to_thread(run)

    async def _listen_for_bot_starts(self):
        """Luistert of er een bot handmatig wordt gestart in de UI, en triggert een backfill."""
        queue = event_bus.subscribe("BOT_STATE_CHANGED")
        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                if event["action"] == "started":
                    print(f"⏳ Triggering historical backfill for Bot ID: {event['bot_id']}...")
                    asyncio.create_task(self._backfill_bot(event["bot_id"]))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def _backfill_bot(self, bot_id: int):
        """Berekent historische signalen. Simuleert trades ALLEEN als backtest_on_start aan staat."""
        def run_backfill():
            db = SessionLocal()
            try:
                bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
                if not bot or not bot.is_active: return
                
                symbol = bot.settings.get("symbol")
                timeframe = bot.settings.get("timeframe")
                exit_node = bot.settings.get("exit_node")
                
                # NIEUW: Kijk in de bot config of we orders/posities moeten simuleren
                run_backtest = bot.settings.get("backtest_on_start", False)

                query = db.query(
                    Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume
                ).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe
                ).order_by(Candle.timestamp.asc()).statement
                
                df = pd.read_sql(query, db.bind)
                if df.empty: return

                evaluator = NodeEvaluator(bot.settings)
                evaluator.df = df.copy()
                evaluator._calculate_indicators() 

                existing_timestamps = {s[0] for s in db.query(Signal.timestamp).filter(Signal.bot_name == bot.name).all()}
                
                new_signals = []
                standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume']

                # --- TRADING SIMULATOR STATE ---
                open_position = None 

                for index, row in evaluator.df.iterrows():
                    ts = row['timestamp']
                    current_price = float(row['close'])
                    
                    try:
                        is_buy = bool(evaluator.resolve_node(bot.settings.get("entry_node"), index))
                    except: is_buy = False
                    
                    try:
                        is_sell = bool(evaluator.resolve_node(exit_node, index)) if exit_node else False
                    except: is_sell = False

                    # 1. TRADE LOGICA (Wordt alleen uitgevoerd als run_backtest True is)
                    if run_backtest:
                        if is_buy and not open_position:
                            open_position = Position(
                                bot_name=bot.name, symbol=symbol, mode="backtest", 
                                status="open", side="long", entry_price=current_price, amount=0.1
                            )
                            db.add(open_position)
                            db.flush() 
                            
                            buy_order = Order(
                                position_id=open_position.id, bot_name=bot.name, mode="backtest", 
                                symbol=symbol, side="buy", order_type="market", price=current_price, 
                                amount=0.1, timestamp=ts
                            )
                            db.add(buy_order)

                        elif is_sell and open_position:
                            open_position.status = "closed"
                            open_position.closed_at = ts
                            open_position.profit_abs = (current_price - open_position.entry_price) * open_position.amount
                            open_position.profit_pct = ((current_price - open_position.entry_price) / open_position.entry_price) * 100
                            
                            sell_order = Order(
                                position_id=open_position.id, bot_name=bot.name, mode="backtest", 
                                symbol=symbol, side="sell", order_type="market", price=current_price, 
                                amount=0.1, timestamp=ts
                            )
                            db.add(sell_order)
                            open_position = None 

                    # 2. SIGNAAL OPSLAAN VOOR DE GRAFIEK (Dit gebeurt ALTIJD, ongeacht run_backtest)
                    if ts in existing_timestamps: continue

                    indicators = {
                        col: float(row[col]) 
                        for col in evaluator.df.columns 
                        if col not in standard_cols and not pd.isna(row[col])
                    }

                    if indicators:
                        action_str = "buy" if is_buy else ("sell" if is_sell else "neutral")
                        new_signals.append(Signal(
                            candle_id=int(row['id']), symbol=symbol, timestamp=ts, bot_name=bot.name,
                            name="STRATEGY_TICK", action=action_str, extra_data=indicators
                        ))

                if new_signals:
                    db.bulk_save_objects(new_signals)
                    
                db.commit()
                print(f"✅ Historical Sync Complete: '{bot.name}' (Backtest: {'ON' if run_backtest else 'OFF'})")

            except Exception as e:
                print(f"❌ Backfill Error: {e}")
                db.rollback()
            finally:
                db.close()
                
        await asyncio.to_thread(run_backfill)


    async def _process_bots(self, symbol: str, timeframe: str):
        """Verwerkt ALLEEN de allernieuwste live kaars als deze sluit."""
        def run_logic():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
                matching_bots = [b for b in active_bots if b.settings.get("symbol") == symbol and b.settings.get("timeframe") == timeframe]
                if not matching_bots: return

                # Haal de laatste ~150 kaarsen op voor de indicator berekeningen
                query = db.query(
                    Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume
                ).filter(
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

                    # Evalueer Koop / Verkoop
                    try:
                        is_buy = bool(evaluator.resolve_node(bot.settings.get("entry_node"), latest_index))
                    except: is_buy = False
                    
                    try:
                        exit_node = bot.settings.get("exit_node")
                        is_sell = bool(evaluator.resolve_node(exit_node, latest_index)) if exit_node else False
                    except: is_sell = False

                    # LIVE TRADING SIMULATOR (Sandbox of Live)
                    mode = "paper" if bot.is_sandbox else "live"
                    open_position = db.query(Position).filter(
                        Position.bot_name == bot.name, Position.status == "open", Position.mode == mode
                    ).first()

                    if is_buy and not open_position:
                        open_position = Position(
                            bot_name=bot.name, symbol=symbol, mode=mode, 
                            status="open", side="long", entry_price=current_price, amount=0.1
                        )
                        db.add(open_position)
                        db.flush()
                        db.add(Order(
                            position_id=open_position.id, bot_name=bot.name, mode=mode, 
                            symbol=symbol, side="buy", order_type="market", price=current_price, 
                            amount=0.1, timestamp=latest_time
                        ))

                    elif is_sell and open_position:
                        open_position.status = "closed"
                        open_position.closed_at = latest_time
                        open_position.profit_abs = (current_price - open_position.entry_price) * open_position.amount
                        open_position.profit_pct = ((current_price - open_position.entry_price) / open_position.entry_price) * 100
                        db.add(Order(
                            position_id=open_position.id, bot_name=bot.name, mode=mode, 
                            symbol=symbol, side="sell", order_type="market", price=current_price, 
                            amount=0.1, timestamp=latest_time
                        ))

                    # Sla het signaal op voor de grafiek (voorkom dubbel opslaan)
                    standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume']
                    indicators = {
                        col: float(latest_row[col]) for col in evaluator.df.columns if col not in standard_cols and not pd.isna(latest_row[col])
                    }

                    existing_signal = db.query(Signal).filter(Signal.bot_name == bot.name, Signal.timestamp == latest_time).first()
                    if not existing_signal and indicators:
                        action_str = "buy" if is_buy else ("sell" if is_sell else "neutral")
                        db.add(Signal(
                            candle_id=int(latest_row['id']), symbol=symbol, timestamp=latest_time,
                            bot_name=bot.name, name="STRATEGY_TICK", action=action_str, extra_data=indicators
                        ))
                        db.commit()
                        if is_buy or is_sell: print(f"🚀 LIVE SIGNAL: '{bot.name}' says {action_str.upper()} {symbol} @ {latest_time}")

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