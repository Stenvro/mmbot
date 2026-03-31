import asyncio
import json
import logging
import websockets
import time
import ccxt
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.core.database import SessionLocal
from backend.models.bots import BotConfig
from backend.models.candles import Candle
from backend.core.events import event_bus

logger = logging.getLogger("apexalgo.streamer")

OKX_WS_URL = "wss://ws.okx.com:8443/ws/v5/business"

class OKXStreamer:
    def __init__(self):
        self.running = False
        self.ws = None
        self.exchange = ccxt.okx()
        self.needs_reconnect = False
        self._ws_lock = asyncio.Lock()

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

    BAR_MAP = {
        '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
        '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
        '1d': '1D', '1w': '1W',
    }

    def _sync_one_symbol(self, inst_id: str, timeframe: str, bar: str, lookback_limit: int):
        symbol = inst_id.replace("-", "/")
        db: Session = SessionLocal()
        try:
            logger.info("Historical sync: %s (%s) - fetching up to %d candles backwards...", symbol, timeframe, lookback_limit)

            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            current_end = now_ms
            all_ohlcv = []

            while len(all_ohlcv) < lookback_limit:
                try:
                    res = self.exchange.publicGetMarketHistoryCandles({
                        'instId': inst_id,
                        'bar': bar,
                        'after': str(current_end),
                        'limit': '100',
                    })

                    if not res or 'data' not in res or not res['data']:
                        logger.info("Reached listing date or maximum history limit for %s.", symbol)
                        break

                    data = res['data']
                    all_ohlcv.extend(data)
                    current_end = int(data[-1][0])
                    time.sleep(0.2)

                except Exception as ex:
                    logger.warning("OKX historical fetch error for %s: %s", symbol, ex)
                    break

            if not all_ohlcv:
                return

            all_ohlcv.sort(key=lambda x: int(x[0]))

            seen_ts = set()
            deduped = []
            for row in all_ohlcv:
                ts = int(row[0])
                if ts not in seen_ts:
                    seen_ts.add(ts)
                    deduped.append(row)

            deduped = deduped[-lookback_limit:]

            start_dt = datetime.fromtimestamp(int(deduped[0][0]) / 1000.0, tz=timezone.utc)
            end_dt = datetime.fromtimestamp(int(deduped[-1][0]) / 1000.0, tz=timezone.utc)

            existing_candles = db.query(Candle.timestamp).filter(
                Candle.symbol == symbol, Candle.timeframe == timeframe,
                Candle.timestamp >= start_dt, Candle.timestamp <= end_dt
            ).all()

            existing_times = {c[0].replace(tzinfo=timezone.utc) if c[0].tzinfo is None else c[0] for c in existing_candles}

            new_candles = []
            for row in deduped:
                dt = datetime.fromtimestamp(int(row[0]) / 1000.0, tz=timezone.utc)
                if dt not in existing_times:
                    try:
                        new_candles.append(Candle(
                            symbol=symbol, timeframe=timeframe, timestamp=dt,
                            open=float(row[1]), high=float(row[2]), low=float(row[3]),
                            close=float(row[4]), volume=float(row[5])
                        ))
                    except (IndexError, ValueError) as e:
                        logger.warning("Skipping malformed candle data for %s: %s", symbol, e)
                        continue

            if new_candles:
                try:
                    db.bulk_save_objects(new_candles)
                    db.commit()
                    logger.info("Sync complete for %s (%s). Saved %d new rows.", symbol, timeframe, len(new_candles))
                except Exception as e:
                    db.rollback()
                    logger.error("DB save error during sync for %s: %s", symbol, e)
            else:
                logger.info("Sync complete for %s (%s). Data was already up-to-date.", symbol, timeframe)
        finally:
            db.close()

    def _sync_historical_gaps(self, subscriptions_dict: dict):
        tasks = []
        for (channel, inst_id), lookback_limit in subscriptions_dict.items():
            timeframe = channel.replace("candle", "").lower()
            bar = self.BAR_MAP.get(timeframe)
            if not bar:
                logger.warning("Unknown timeframe '%s' for %s, skipping sync.", timeframe, inst_id)
                continue
            tasks.append((inst_id, timeframe, bar, lookback_limit))

        if not tasks:
            return

        max_workers = min(len(tasks), 5)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(self._sync_one_symbol, inst_id, timeframe, bar, lookback_limit): inst_id
                for inst_id, timeframe, bar, lookback_limit in tasks
            }
            for future in as_completed(futures):
                inst_id = futures[future]
                try:
                    future.result()
                except Exception as e:
                    logger.error("Sync failed for %s: %s", inst_id, e, exc_info=True)

    async def _listen_to_bot_changes(self):
        queue = event_bus.subscribe("BOT_STATE_CHANGED")
        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                logger.info("Bot state changed (id=%s, action=%s). Reconnecting streams...", event['bot_id'], event['action'])
                self.needs_reconnect = True
                async with self._ws_lock:
                    if self.ws:
                        await self.ws.close()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def start(self):
        self.running = True
        logger.info("OKX WebSocket Streamer starting...")
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
                    async with self._ws_lock:
                        self.ws = ws
                    await ws.send(json.dumps({"op": "subscribe", "args": args}))
                    logger.info("WebSocket Live for %d streams.", len(args))

                    while self.running and not self.needs_reconnect:
                        try:
                            message = await asyncio.wait_for(ws.recv(), timeout=30.0)
                            await self._process_message(message)
                        except asyncio.TimeoutError:
                            # No message in 30s, send ping to keep alive
                            continue

            except websockets.exceptions.ConnectionClosed:
                if self.running and not self.needs_reconnect:
                    logger.warning("OKX Connection closed. Reconnecting...")
                    await asyncio.sleep(2)
            except Exception as e:
                if self.running:
                    logger.error("Streamer error: %s", e, exc_info=True)
                    await asyncio.sleep(5)

    async def _process_message(self, message: str):
        try:
            data = json.loads(message)
        except json.JSONDecodeError as e:
            logger.warning("Malformed WebSocket message: %s", e)
            return

        if "arg" in data and "data" in data:
            channel = data["arg"]["channel"]
            inst_id = data["arg"]["instId"]
            symbol = inst_id.replace("-", "/")
            timeframe = channel.replace("candle", "").lower()

            for candle_data in data["data"]:
                try:
                    ts_ms = int(candle_data[0])
                    dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
                    is_closed = (candle_data[8] == "1")
                    await self._save_candle_to_db(symbol, timeframe, dt, candle_data, is_closed)
                except (IndexError, ValueError) as e:
                    logger.warning("Skipping malformed candle data: %s", e)

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
            except Exception as e:
                db.rollback()
                logger.warning("Failed to save candle %s/%s: %s", symbol, timeframe, e)
            finally:
                db.close()

        await asyncio.to_thread(db_op)

        if is_closed:
            await event_bus.publish("CANDLE_CLOSED", {"symbol": symbol, "timeframe": timeframe, "timestamp": timestamp})

    def stop(self):
        self.running = False
        logger.info("OKX Streamer stopped.")

okx_streamer = OKXStreamer()
