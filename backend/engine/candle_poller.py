import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.core.exchange_registry import build_exchange
from backend.core.events import event_bus
from backend.models.bots import BotConfig
from backend.models.candles import Candle
from backend.models.exchange_keys import ExchangeKey

logger = logging.getLogger("apexalgo.poller")


class CandlePoller:
    """
    Exchange-agnostic market data engine.

    For every active bot subscription (exchange, symbol, timeframe) the poller:
      1. Back-fills missing historical candles on startup using CCXT fetch_ohlcv.
      2. Polls the exchange at a safe interval to detect newly closed candles.
      3. Saves closed candles to the database and publishes a CANDLE_CLOSED event
         so BotManager can evaluate strategy logic.

    This replaces the OKX-specific WebSocket streamer with a universal REST
    approach that works for any CCXT-supported exchange.
    """

    def __init__(self):
        self.running = False
        self.needs_reconnect = False
        self._poll_tasks: list[asyncio.Task] = []
        self._exchange_cache: dict[str, object] = {}  # exchange_id → ccxt instance

    # ─────────────────────────────────────────────────────────────────────────
    # Public interface
    # ─────────────────────────────────────────────────────────────────────────

    async def start(self):
        self.running = True
        logger.info("Candle Poller starting.")
        asyncio.create_task(self._listen_for_bot_changes())

        while self.running:
            self.needs_reconnect = False
            subs = self._get_active_subscriptions()

            if not subs:
                await asyncio.sleep(2)
                continue

            await asyncio.to_thread(self._backfill_all, subs)

            # Cancel any stale polling tasks before starting fresh ones
            for task in self._poll_tasks:
                task.cancel()
            self._poll_tasks.clear()

            for (exchange_name, symbol, timeframe) in subs:
                task = asyncio.create_task(
                    self._poll_symbol(exchange_name, symbol, timeframe)
                )
                self._poll_tasks.append(task)

            logger.info("Poller live: %d subscription(s).", len(subs))

            while self.running and not self.needs_reconnect:
                await asyncio.sleep(1)

        for task in self._poll_tasks:
            task.cancel()

    def stop(self):
        self.running = False
        logger.info("Candle Poller stopped.")

    # ─────────────────────────────────────────────────────────────────────────
    # Subscription management
    # ─────────────────────────────────────────────────────────────────────────

    def _get_active_subscriptions(self) -> dict:
        """
        Returns { (exchange_name, symbol, timeframe): lookback_limit }
        for every active bot.

        Exchange resolution priority:
          1. Bot has an API key  → use that key's exchange.
          2. Bot settings contain data_exchange  → use that.
          3. Default → 'okx'.
        """
        db: Session = SessionLocal()
        subs: dict = {}
        try:
            active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
            all_keys = {k.name: k for k in db.query(ExchangeKey).all()}
            for bot in active_bots:
                settings = bot.settings or {}
                symbols = settings.get("symbols", [])
                if not symbols and settings.get("symbol"):
                    symbols = [settings.get("symbol")]

                timeframe = settings.get("timeframe")
                lookback = int(settings.get("backtest_lookback", 500))

                exchange_name = settings.get("data_exchange", "okx")
                api_key_name = settings.get("api_key_name")
                if api_key_name:
                    key_record = all_keys.get(api_key_name)
                    if key_record:
                        exchange_name = key_record.exchange

                if symbols and timeframe:
                    for symbol in symbols:
                        key = (exchange_name, symbol, timeframe)
                        subs[key] = max(subs.get(key, 0), lookback)
            return subs
        finally:
            db.close()

    # ─────────────────────────────────────────────────────────────────────────
    # Historical back-fill
    # ─────────────────────────────────────────────────────────────────────────

    def _backfill_all(self, subs: dict):
        """Run back-fill for all subscriptions in parallel (one thread per symbol)."""
        tasks = list(subs.items())
        max_workers = min(len(tasks), 5)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self._backfill_one_symbol,
                    exchange_name, symbol, timeframe, lookback
                ): (exchange_name, symbol, timeframe)
                for (exchange_name, symbol, timeframe), lookback in tasks
            }
            for future in as_completed(futures):
                key = futures[future]
                try:
                    future.result()
                except Exception as exc:
                    logger.error("Back-fill failed for %s: %s", key, exc, exc_info=True)

    def _backfill_one_symbol(
        self,
        exchange_name: str,
        symbol: str,
        timeframe: str,
        lookback_limit: int,
    ):
        exchange = self._get_public_exchange(exchange_name)
        logger.info(
            "Back-fill: %s/%s/%s — requesting up to %d candles.",
            exchange_name, symbol, timeframe, lookback_limit,
        )

        try:
            tf_seconds = exchange.parse_timeframe(timeframe)
        except Exception:
            tf_seconds = 60

        tf_ms = tf_seconds * 1000
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        start_ts = now_ms - (lookback_limit * tf_ms)
        current_since = start_ts
        total_saved = 0

        db: Session = SessionLocal()
        try:
            while total_saved < lookback_limit:
                try:
                    batch = exchange.fetch_ohlcv(symbol, timeframe, since=current_since, limit=500)
                except Exception as exc:
                    logger.warning("Back-fill fetch error %s/%s/%s: %s", exchange_name, symbol, timeframe, exc)
                    break

                if not batch:
                    break

                # Deduplicate against DB for this batch's time range
                batch_start = datetime.fromtimestamp(int(batch[0][0]) / 1000.0, tz=timezone.utc)
                batch_end = datetime.fromtimestamp(int(batch[-1][0]) / 1000.0, tz=timezone.utc)

                existing_times = {
                    (r[0].replace(tzinfo=timezone.utc) if r[0].tzinfo is None else r[0])
                    for r in db.query(Candle.timestamp).filter(
                        Candle.exchange == exchange_name,
                        Candle.symbol == symbol,
                        Candle.timeframe == timeframe,
                        Candle.timestamp >= batch_start,
                        Candle.timestamp <= batch_end,
                    ).all()
                }

                new_candles = []
                for c in batch:
                    dt = datetime.fromtimestamp(int(c[0]) / 1000.0, tz=timezone.utc)
                    if dt not in existing_times:
                        try:
                            new_candles.append(Candle(
                                exchange=exchange_name,
                                symbol=symbol,
                                timeframe=timeframe,
                                timestamp=dt,
                                open=float(c[1]),
                                high=float(c[2]),
                                low=float(c[3]),
                                close=float(c[4]),
                                volume=float(c[5]),
                                marketcap=0.0,
                            ))
                        except (IndexError, ValueError) as exc:
                            logger.warning("Malformed candle skipped for %s: %s", symbol, exc)

                if new_candles:
                    db.bulk_save_objects(new_candles)
                    db.commit()
                    total_saved += len(new_candles)

                last_ts = int(batch[-1][0])
                if last_ts >= now_ms or len(batch) < 2:
                    break

                current_since = last_ts + 1
                time.sleep(0.2)

            if total_saved > 0:
                logger.info(
                    "Back-fill complete: %s/%s/%s — saved %d new candles.",
                    exchange_name, symbol, timeframe, total_saved,
                )
            else:
                logger.info(
                    "Back-fill: %s/%s/%s — already up to date.",
                    exchange_name, symbol, timeframe,
                )
        except Exception as exc:
            db.rollback()
            logger.error("Back-fill DB error for %s/%s/%s: %s", exchange_name, symbol, timeframe, exc)
        finally:
            db.close()

        # Signal that backfill is done for this subscription
        try:
            loop = asyncio.get_event_loop()
            loop.call_soon_threadsafe(
                asyncio.ensure_future,
                event_bus.publish("BACKFILL_COMPLETE", {
                    "exchange": exchange_name,
                    "symbol": symbol,
                    "timeframe": timeframe,
                })
            )
        except RuntimeError:
            pass

    # ─────────────────────────────────────────────────────────────────────────
    # Live polling
    # ─────────────────────────────────────────────────────────────────────────

    async def _poll_symbol(self, exchange_name: str, symbol: str, timeframe: str):
        """
        Poll for closed candles on a single (exchange, symbol, timeframe).

        Polling interval = max(10s, min(60s, tf_seconds / 4)).
        The penultimate candle returned by fetch_ohlcv(limit=2) is always the
        most recently CLOSED candle. When its timestamp advances, we have a new
        closed candle.
        """
        exchange = self._get_public_exchange(exchange_name)
        try:
            tf_seconds = exchange.parse_timeframe(timeframe)
        except Exception:
            tf_seconds = 60

        poll_interval = max(10, min(60, tf_seconds // 4))
        last_closed_ts: int | None = None

        logger.info(
            "Poll active: %s/%s/%s every %ds.",
            exchange_name, symbol, timeframe, poll_interval,
        )

        while self.running and not self.needs_reconnect:
            try:
                candles = await asyncio.to_thread(
                    exchange.fetch_ohlcv, symbol, timeframe, None, 2
                )
                if len(candles) >= 2:
                    closed = candles[-2]  # penultimate = most recently closed candle
                    closed_ts = int(closed[0])
                    if last_closed_ts != closed_ts:
                        await self._save_and_notify(exchange_name, symbol, timeframe, closed)
                        last_closed_ts = closed_ts
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning(
                    "Poll error %s/%s/%s: %s", exchange_name, symbol, timeframe, exc
                )

            try:
                await asyncio.sleep(poll_interval)
            except asyncio.CancelledError:
                break

    async def _save_and_notify(
        self,
        exchange_name: str,
        symbol: str,
        timeframe: str,
        candle_data: list,
    ):
        ts_ms = int(candle_data[0])
        dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)

        def db_op():
            db: Session = SessionLocal()
            try:
                existing = db.query(Candle).filter(
                    Candle.exchange == exchange_name,
                    Candle.symbol == symbol,
                    Candle.timeframe == timeframe,
                    Candle.timestamp == dt,
                ).first()
                if not existing:
                    candle = Candle(
                        exchange=exchange_name,
                        symbol=symbol,
                        timeframe=timeframe,
                        timestamp=dt,
                        open=float(candle_data[1]),
                        high=float(candle_data[2]),
                        low=float(candle_data[3]),
                        close=float(candle_data[4]),
                        volume=float(candle_data[5]),
                        marketcap=0.0,
                    )
                    db.add(candle)
                else:
                    # Update in case the candle was still forming when first saved
                    existing.open   = float(candle_data[1])
                    existing.high   = float(candle_data[2])
                    existing.low    = float(candle_data[3])
                    existing.close  = float(candle_data[4])
                    existing.volume = float(candle_data[5])
                db.commit()
            except Exception as exc:
                db.rollback()
                logger.warning("Failed to save candle %s/%s: %s", symbol, timeframe, exc)
            finally:
                db.close()

        await asyncio.to_thread(db_op)
        await event_bus.publish("CANDLE_CLOSED", {
            "exchange":  exchange_name,
            "symbol":    symbol,
            "timeframe": timeframe,
            "timestamp": dt,
        })

    # ─────────────────────────────────────────────────────────────────────────
    # Bot change listener
    # ─────────────────────────────────────────────────────────────────────────

    async def _listen_for_bot_changes(self):
        queue = event_bus.subscribe("BOT_STATE_CHANGED")
        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                logger.info(
                    "Bot state changed (id=%s, action=%s). Refreshing subscriptions.",
                    event["bot_id"], event["action"],
                )
                self.needs_reconnect = True
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    # ─────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _get_public_exchange(self, exchange_name: str):
        """Return a cached unauthenticated exchange instance for public market data."""
        if exchange_name not in self._exchange_cache:
            self._exchange_cache[exchange_name] = build_exchange(exchange_name)
        return self._exchange_cache[exchange_name]


candle_poller = CandlePoller()
