import asyncio
import json
import websockets
import time
import ccxt
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.core.database import SessionLocal
from backend.models.bots import BotConfig
from backend.models.candles import Candle
from backend.core.events import event_bus

OKX_WS_URL = "wss://ws.okx.com:8443/ws/v5/business"

class OKXStreamer:
    def __init__(self):
        self.running = False
        self.ws = None
        self.exchange = ccxt.okx()
        self.needs_reconnect = False 

    def _get_active_subscriptions(self) -> dict:
        db: Session = SessionLocal()
        subs_dict = {} 
        try:
            active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
            for bot in active_bots:
                settings = bot.settings or {}
                symbols = settings.get("symbols", [])
                if not symbols and settings.get("symbol"):
                    symbols = [settings.get("symbol")]
                    
                timeframe = settings.get("timeframe")
                lookback = int(settings.get("backtest_lookback", 500))
                
                if symbols and timeframe:
                    for sym in symbols:
                        okx_inst_id = sym.replace("/", "-").upper()
                        tf = timeframe.lower()
                        if tf == "1h": tf = "1H" 
                        elif tf == "4h": tf = "4H"
                        
                        sub_key = (f"candle{tf}", okx_inst_id)
                        
                        if sub_key in subs_dict:
                            subs_dict[sub_key] = max(subs_dict[sub_key], lookback)
                        else:
                            subs_dict[sub_key] = lookback
                            
            return subs_dict
        finally:
            db.close()

    def _sync_historical_gaps(self, subscriptions_dict: dict):
        db: Session = SessionLocal()

        try:
            for (channel, inst_id), lookback_limit in subscriptions_dict.items():
                symbol = inst_id.replace("-", "/")
                timeframe = channel.replace("candle", "").lower()
                tf_ms = self.exchange.parse_timeframe(timeframe) * 1000
                
                now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
                # We berekenen hoe ver we terug in de tijd moeten
                target_since = now_ms - ((lookback_limit + 10) * tf_ms)
                
                print(f"📥 Historical Sync: {symbol} ({timeframe}) - Fetching {lookback_limit} candles backwards...")
                
                # --- FIX: ACHTERUIT PAGINEREN ---
                current_end = now_ms
                all_ohlcv = []
                
                while current_end > target_since:
                    try:
                        # We gebruiken 'until' om OKX te dwingen de historie te geven, ongeacht hoe oud!
                        ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, limit=100, params={'until': current_end})
                    except Exception as ex:
                        print(f"⚠️ Warning: Could not fetch {symbol} from OKX: {ex}")
                        break
                        
                    if not ohlcv or len(ohlcv) == 0:
                        break
                        
                    valid_ohlcv = [row for row in ohlcv if row[0] >= target_since]
                    all_ohlcv.extend(valid_ohlcv)
                    
                    first_ts = ohlcv[0][0]
                    if first_ts >= current_end: 
                        break # Voorkom infinite loop als de exchange vastloopt
                    
                    current_end = first_ts - 1 # Zet de nieuwe grens net voor de oudste kaars die we net vonden
                    time.sleep(self.exchange.rateLimit / 1000)
                
                # Sorteer ze weer chronologisch
                all_ohlcv.sort(key=lambda x: x[0])
                # --------------------------------

                if not all_ohlcv:
                    continue

                start_dt = datetime.fromtimestamp(all_ohlcv[0][0] / 1000.0, tz=timezone.utc)
                end_dt = datetime.fromtimestamp(all_ohlcv[-1][0] / 1000.0, tz=timezone.utc)
                
                existing_candles = db.query(Candle.timestamp).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe,
                    Candle.timestamp >= start_dt, Candle.timestamp <= end_dt
                ).all()
                
                existing_times = {c[0].replace(tzinfo=timezone.utc) if c[0].tzinfo is None else c[0] for c in existing_candles}
                
                new_candles = []
                for data in all_ohlcv:
                    dt = datetime.fromtimestamp(data[0] / 1000.0, tz=timezone.utc)
                    if dt not in existing_times:
                        new_candles.append(Candle(
                            symbol=symbol, timeframe=timeframe, timestamp=dt,
                            open=float(data[1]), high=float(data[2]), low=float(data[3]),
                            close=float(data[4]), volume=float(data[5])
                        ))
                
                if new_candles:
                    db.bulk_save_objects(new_candles)
                    db.commit()
                
                print(f"✅ Sync complete for {symbol} ({timeframe}). Fetched {len(all_ohlcv)} rows.")
        except Exception as e:
            print(f"❌ Sync Error: {e}")
        finally:
            db.close()

    async def _listen_to_bot_changes(self):
        queue = event_bus.subscribe("BOT_STATE_CHANGED")
        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                print(f"🔄 Bot state changed (ID: {event['bot_id']} -> {event['action']}). Reloading streams...")
                self.needs_reconnect = True
                if self.ws: await self.ws.close()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def start(self):
        self.running = True
        print("🌐 OKX WebSocket Streamer starting...")
        asyncio.create_task(self._listen_to_bot_changes())
        
        while self.running:
            try:
                self.needs_reconnect = False
                subs_dict = self._get_active_subscriptions()
                
                if not subs_dict:
                    await asyncio.sleep(2)
                    continue
                
                self._sync_historical_gaps(subs_dict)
                args = [{"channel": c, "instId": i} for c, i in subs_dict.keys()]

                async with websockets.connect(OKX_WS_URL) as ws:
                    self.ws = ws
                    await ws.send(json.dumps({"op": "subscribe", "args": args}))
                    print(f"📡 WebSocket Live for {len(args)} streams.")

                    while self.running and not self.needs_reconnect:
                        message = await ws.recv()
                        await self._process_message(message)
                        
            except websockets.exceptions.ConnectionClosed:
                if self.running and not self.needs_reconnect:
                    print("⚠️ OKX Connection closed. Reconnecting...")
                    await asyncio.sleep(2)
            except Exception as e:
                if self.running:
                    print(f"❌ Streamer Error: {e}")
                    await asyncio.sleep(5)

    async def _process_message(self, message: str):
        data = json.loads(message)
        if "arg" in data and "data" in data:
            channel = data["arg"]["channel"]
            inst_id = data["arg"]["instId"]
            symbol = inst_id.replace("-", "/")
            timeframe = channel.replace("candle", "").lower()
            
            for candle_data in data["data"]:
                ts_ms = int(candle_data[0])
                dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
                is_closed = (candle_data[8] == "1")
                await self._save_candle_to_db(symbol, timeframe, dt, candle_data, is_closed)

    async def _save_candle_to_db(self, symbol, timeframe, timestamp, data, is_closed):
        def db_op():
            db = SessionLocal()
            try:
                candle = db.query(Candle).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe, Candle.timestamp == timestamp
                ).first()

                if not candle:
                    candle = Candle(symbol=symbol, timeframe=timeframe, timestamp=timestamp)
                    db.add(candle)

                candle.open = float(data[1])
                candle.high = float(data[2])
                candle.low = float(data[3])
                candle.close = float(data[4])
                candle.volume = float(data[5])
                db.commit()
            finally:
                db.close()
                
        await asyncio.to_thread(db_op)
        
        if is_closed:
            await event_bus.publish("CANDLE_CLOSED", {"symbol": symbol, "timeframe": timeframe, "timestamp": timestamp})

    def stop(self):
        self.running = False
        if self.ws: asyncio.create_task(self.ws.close())
        print("🌐 OKX Streamer stopped.")

okx_streamer = OKXStreamer()