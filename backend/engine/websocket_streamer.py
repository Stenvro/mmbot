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
                
                print(f"📥 Historical Sync: {symbol} ({timeframe}) - Fetching up to {lookback_limit} candles BACKWARDS...")
                
                now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
                current_end = now_ms
                all_ohlcv = []
                
                bar_map = {'1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '1d': '1D'}
                bar = bar_map.get(timeframe.lower(), '15m')
                
                # --- FIX: ACHTERUIT DOWNLOADEN ---
                while len(all_ohlcv) < lookback_limit:
                    try:
                        res = self.exchange.publicGetMarketHistoryCandles({
                            'instId': inst_id,
                            'bar': bar,
                            'after': str(current_end),
                            'limit': '100'
                        })
                        
                        if not res or 'data' not in res or not res['data']:
                            print(f"⚠️ Listing datum of maximum historie bereikt voor {symbol}.")
                            break 
                            
                        data = res['data']
                        all_ohlcv.extend(data)
                        
                        # data[-1] is de oudste kaars in deze specifieke batch. 
                        current_end = int(data[-1][0])
                        time.sleep(self.exchange.rateLimit / 1000)
                        
                    except Exception as ex:
                        print(f"⚠️ OKX Archief Error voor {symbol}: {ex}")
                        break
                
                if not all_ohlcv:
                    continue
                
                # Sorteer van oud naar nieuw 
                all_ohlcv.sort(key=lambda x: int(x[0]))
                
                # --- FIX: DEDUPLICATIE ---
                seen_ts = set()
                deduped = []
                for row in all_ohlcv:
                    ts = int(row[0])
                    if ts not in seen_ts:
                        seen_ts.add(ts)
                        deduped.append(row)
                        
                deduped = deduped[-lookback_limit:]
                # -------------------------

                # FIX: String naar Int conversie toegevoegd vóór de deling door 1000.0!
                start_dt = datetime.fromtimestamp(int(deduped[0][0]) / 1000.0, tz=timezone.utc)
                end_dt = datetime.fromtimestamp(int(deduped[-1][0]) / 1000.0, tz=timezone.utc)
                
                existing_candles = db.query(Candle.timestamp).filter(
                    Candle.symbol == symbol, Candle.timeframe == timeframe,
                    Candle.timestamp >= start_dt, Candle.timestamp <= end_dt
                ).all()
                
                existing_times = {c[0].replace(tzinfo=timezone.utc) if c[0].tzinfo is None else c[0] for c in existing_candles}
                
                new_candles = []
                for data in deduped:
                    dt = datetime.fromtimestamp(int(data[0]) / 1000.0, tz=timezone.utc)
                    if dt not in existing_times:
                        new_candles.append(Candle(
                            symbol=symbol, timeframe=timeframe, timestamp=dt,
                            open=float(data[1]), high=float(data[2]), low=float(data[3]),
                            close=float(data[4]), volume=float(data[5])
                        ))
                
                if new_candles:
                    try:
                        db.bulk_save_objects(new_candles)
                        db.commit()
                        print(f"✅ Sync complete for {symbol} ({timeframe}). Fetched {len(deduped)} rows.")
                    except Exception as e:
                        db.rollback()
                        print(f"❌ DB Opslag Error (Waarschijnlijk Integrity): {e}")
                else:
                    print(f"✅ Sync complete for {symbol} ({timeframe}). Data was al up-to-date.")

        except Exception as e:
            print(f"❌ Sync Loop Error: {e}")
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
                
                await asyncio.to_thread(self._sync_historical_gaps, subs_dict)
                
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