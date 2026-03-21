import asyncio
import pandas as pd
from sqlalchemy.orm import Session
from backend.core.database import SessionLocal
from backend.models.bots import BotConfig
from backend.models.candles import Candle
from backend.models.signals import Signal
from backend.engine.evaluator import NodeEvaluator
from backend.core.events import event_bus

class BotManager:
    def __init__(self):
        self.running = False

    async def start(self):
        self.running = True
        print("🤖 Bot Manager started. Listening for events...")
        
        # Start de backfill listener in de achtergrond
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

    async def _listen_for_bot_starts(self):
        """Luistert of er een bot is gestart, en triggert een historische backfill."""
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
        """Berekent met terugwerkende kracht alle signalen en indicatoren voor historische data."""
        def run_backfill():
            db = SessionLocal()
            try:
                bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
                if not bot or not bot.is_active: return
                
                symbol = bot.settings.get("symbol")
                timeframe = bot.settings.get("timeframe")

                query = db.query(
                    Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume
                ).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe
                ).order_by(Candle.timestamp.asc()).statement
                
                df = pd.read_sql(query, db.bind)
                if df.empty: return

                evaluator = NodeEvaluator(bot.settings)
                evaluator.df = df.copy()
                evaluator._calculate_indicators() # Reken alle wiskunde uit voor de hele historie

                existing_timestamps = {s[0] for s in db.query(Signal.timestamp).filter(Signal.bot_name == bot.name).all()}
                new_signals = []
                standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume']

                # Loop door alle historische rijen en sla ze op
                for index, row in evaluator.df.iterrows():
                    ts = row['timestamp']
                    if ts in existing_timestamps: continue

                    try:
                        is_buy = bool(evaluator.resolve_node(evaluator.entry_trigger, index))
                    except:
                        is_buy = False

                    indicators = {
                        col: float(row[col]) 
                        for col in evaluator.df.columns 
                        if col not in standard_cols and not pd.isna(row[col])
                    }

                    if indicators:
                        new_signals.append(Signal(
                            candle_id=int(row['id']),
                            symbol=symbol,
                            timestamp=ts,
                            bot_name=bot.name,
                            name="STRATEGY_TICK",
                            action="buy" if is_buy else "neutral",
                            extra_data=indicators
                        ))

                if new_signals:
                    db.bulk_save_objects(new_signals)
                    db.commit()
                    print(f"✅ Backfill Complete: Generated {len(new_signals)} historical signals/ticks for '{bot.name}'")

            except Exception as e:
                print(f"❌ Backfill Error: {e}")
            finally:
                db.close()
                
        await asyncio.to_thread(run_backfill)

    async def _process_bots(self, symbol: str, timeframe: str):
        """Verwerkt ALLEEN de allernieuwste live kaars als deze sluit."""
        def run_logic():
            db: Session = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
                matching_bots = [b for b in active_bots if b.settings.get("symbol") == symbol and b.settings.get("timeframe") == timeframe]
                if not matching_bots: return

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
                    is_buy = evaluator.evaluate(df)
                    
                    latest_row = evaluator.df.iloc[-1]
                    latest_time = latest_row['timestamp']

                    standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume']
                    indicators = {
                        col: float(latest_row[col]) for col in evaluator.df.columns if col not in standard_cols and not pd.isna(latest_row[col])
                    }

                    existing_signal = db.query(Signal).filter(Signal.bot_name == bot.name, Signal.timestamp == latest_time).first()
                    if not existing_signal and indicators:
                        action_str = "buy" if is_buy else "neutral"
                        new_signal = Signal(
                            candle_id=int(latest_row['id']), symbol=symbol, timestamp=latest_time,
                            bot_name=bot.name, name="STRATEGY_TICK", action=action_str, extra_data=indicators
                        )
                        db.add(new_signal)
                        db.commit()
                        if is_buy: print(f"🚀 SIGNAL GENERATED: Bot '{bot.name}' says BUY {symbol} @ {latest_time}")

            except Exception as e:
                print(f"❌ Error executing bot strategy: {e}")
            finally:
                db.close()
                
        await asyncio.to_thread(run_logic)

    def stop(self):
        self.running = False
        print("🤖 Bot Manager stopped.")

bot_manager = BotManager()