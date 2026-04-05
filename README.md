# ApexAlgo

> **Advanced Visual Quantitative Trading Framework**

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![CCXT](https://img.shields.io/badge/CCXT-Integrated-orange?style=for-the-badge)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Status](https://img.shields.io/badge/Status-Alpha-yellow?style=for-the-badge)

ApexAlgo is a full-stack algorithmic trading platform for building, backtesting, and executing systematic trading strategies — without writing code. A node-based visual strategy builder connects directly to a high-performance async execution engine with multi-exchange market data, encrypted exchange key management, and real-time per-bot console output.

> **Alpha release — not production-ready.** APIs and data schemas may change between versions.

---

## Features

### Strategy Builder
- **Visual Node Editor** — drag-and-drop canvas with 51+ technical indicators, logic gates, conditions, and action nodes
- **No-Code Strategy Design** — connect indicator, condition, and logic nodes to build complex entry/exit rules
- **Exchange Routing Node** — select an API key (exchange auto-derived from the key) or manually pick a data exchange when running without a key
- **ReactFlow Graph Serialization** — strategies are compiled to JSON and evaluated per candle

### Execution Engine
- **Three Execution Modes** — forward test (simulated), paper trading (sandbox API), and live exchange execution
- **Async Event-Driven Architecture** — FastAPI backend with concurrent bot management via asyncio
- **Multi-Exchange Market Data** — universal REST polling via CCXT; each `(exchange, symbol, timeframe)` gets its own independent polling stream
- **CCXT Integration** — exchange-agnostic order execution with market precision handling

### Multi-Exchange Support
- **7 Exchanges out of the box** — OKX, Binance, Bitvavo, Coinbase, Crypto.com, Kraken, KuCoin
- **Isolated data streams** — bots on different exchanges poll independently and store candles separately; no cross-exchange data mixing
- **Exchange Registry** — centralized `exchange_registry.py` handles per-exchange config (OKX EU hostname, passphrase exchanges, sandbox modes)
- **Automatic migration** — existing databases are upgraded non-destructively on startup; all historical data is preserved

### Bot Management
- **Live Bot Console** — each bot card has an expandable scrollable console showing real-time engine events (backfill progress, BUY/SELL fills, errors, max drawdown triggers). Persisted in a `bot_logs` table — survives backend restarts
- **Export to File** — save any bot's strategy and settings to a portable `.apex.json` file
- **Import from File** — restore a bot from a previously exported file; name collisions are resolved automatically
- **Duplicate Bot** — clone a bot's configuration without copying its trade history or signal cache
- **Cache Wipe** — clears chart signals, resets the bot's log buffer, and clears the frontend console in one operation

### Performance
- **SQLite WAL Mode** — write-ahead logging enables concurrent reads during writes; bots no longer block each other on database access
- **Incremental Backfill Commits** — candle data is committed to the database after each exchange batch, not all at once; eliminates startup race conditions when multiple bots start simultaneously
- **Indicator Fingerprinting** — bots sharing the same indicator configuration reuse computed results via MD5-based fingerprint keys, avoiding redundant pandas_ta calls in the live processing loop
- **Evaluator Memoization** — `resolve_node()` caches resolved Series per evaluation cycle so diamond-shaped node graphs don't recompute shared indicator nodes
- **Drawdown Caching** — drawdown is tracked per `(bot, mode_group)` with separate backtest and live caches. Lazy-initialized from DB, updated incrementally on position close
- **Backfill Lock** — `_backfilling_bots` set prevents live processing from creating duplicate signals while a bot is mid-backfill
- **Signal Deduplication** — unique constraint on `(bot_name, symbol, timestamp)` with `INSERT OR IGNORE` prevents duplicate signals on bot restart
- **Incremental Signal Polling** — ChartEngine uses `since_id` to fetch only new signals after initial load, reducing per-poll payload from thousands of rows to near-zero
- **Composite Indexes** — dedicated indexes on orders (cooldown checks), candles (lookup by exchange/symbol/timeframe/timestamp), positions (bot/status/mode/symbol), and signals (bot/symbol/timestamp + unique constraint) for hot-path query performance
- **Batched Live Processing** — all open positions, exchange keys, and cooldown counts pre-loaded in 1–2 queries before the bot loop (not per-bot). All signals collected and committed in a single batch after all bots process. One `db.commit()` per candle close event
- **Market Info TTL Cache** — ticker data cached for 10 seconds per symbol, reducing exchange API calls during UI polling
- **Bounded Event Bus** — `asyncio.Queue(maxsize=1000)` with drop-oldest overflow prevents unbounded memory growth from slow subscribers
- **Numpy-Backed Backtest Loop** — indicator and signal arrays are pre-extracted from DataFrames before the per-candle iteration
- **Vectorized Streak Detection** — `increasing_for` / `decreasing_for` conditions use `rolling().sum()` instead of Python loops
- **Batched Signal Inserts** — signals are committed in 500-row chunks to reduce SQLite write lock duration
- **Background Bot Deletion** — deleting a bot returns instantly; heavy cleanup of orders, positions, signals, and logs runs asynchronously after the response
- **Gzip Compression** — nginx compresses JSON, HTML, JS, CSS, and XML responses (threshold: 512 bytes, level 6)
- **Static Asset Caching** — nginx serves hashed Vite assets with `Cache-Control: max-age=31536000, immutable`; index.html is never cached
- **Container Resource Limits** — docker-compose sets CPU/memory caps per service to prevent resource starvation

### Backtesting
- **Shared Capital Pool** — `backtest_capital` is a single pool shared across all whitelist pairs. When BTC uses $140, only the remainder is available for ETH/SOL/XRP. Capital is locked on position open and sale proceeds returned on close
- **Dynamic Trade Sizing** — trade amounts are calculated from running equity, not static starting capital. As capital depletes, position sizes shrink proportionally. Trading halts when equity reaches zero
- **Capital Depletion Guard** — before opening any position, the engine verifies sufficient capital. No phantom-money trades
- **Post-Backtest Drawdown Gate** — backtest always runs to completion; max drawdown is evaluated over all closed positions afterward. If the threshold is exceeded, the bot is stopped and not allowed to go live
- **Vectorized Historical Evaluation** — fast backtest over configurable lookback periods with numpy-backed arrays
- **Stable Backfill Detection** — waits for 5 consecutive stable candle counts (10 seconds) before proceeding, preventing premature backtest starts when exchange data is still loading
- **Backfill Retry Logic** — transient API errors during backfill are retried up to 3 times with exponential backoff; per-thread exchange instances prevent shared rate-limit interference
- **Exchange Timeframe Validation** — unsupported timeframes are detected before backfill/polling; a clear warning is shown when a timeframe isn't available on the selected exchange
- **Adaptive Lookback** — if the exchange has fewer candles than requested (e.g. 5,000 available vs. 50,000 requested), the backtest runs on whatever is available (minimum 20 candles required)
- **Fee-Adjusted P&L** — entry/exit fees and slippage applied to all profit calculations; computed fee amounts are stored on each Order record so the analytics page can report accurate total fees paid
- **Automatic Position Closure** — open positions at backtest end are closed at last price with proper P&L

### Risk Management
- **Tiered Take Profit / Stop Loss** — multiple TP/SL levels with percentage or fixed close amounts
- **ATR & Trailing Stops** — dynamic stop-loss adjustment based on price action
- **Trade Cooldown** — configurable max entries per N candles
- **Position Limits** — per-pair or global max concurrent positions
- **Max Drawdown Auto-Stop** — evaluated after full backtest to gate live entry; during live trading, checked after every closed position. Stops the bot when equity drawdown from peak exceeds the configured threshold
- **Max Order Value Guard** — rejects live orders exceeding a configurable USD limit

### Order Safety
- **Order Fill Validation** — verifies exchange order status after every CCXT call
- **Unique Order Identification** — UUID-suffixed local order IDs prevent duplicate entries
- **Exchange Instance Caching** — single CCXT connection per bot cycle for performance
- **Structured Audit Logging** — order responses logged with id, status, filled amount, and fees

### Security
- **Fernet Encryption** — exchange API credentials encrypted at rest
- **Timing-Safe Authentication** — all endpoints require `X-API-Key` with HMAC-based comparison
- **Local TLS** — self-signed or mkcert-generated trusted certificates
- **Environment Isolation** — secrets auto-generated during setup, never committed

### Analytics
- **Equity Curve** — inline SVG cumulative P&L chart over time (no external chart library)
- **Buy & Hold Comparison** — per-symbol strategy return vs. passive buy-and-hold; strategy % is `total_pnl / backtest_capital * 100` using the same capital base as B&H for fair comparison; reference price anchored to the true first entry across all positions (open and closed)
- **8-Metric Stats Strip** — Net P&L, Win Rate, Profit Factor, Max Drawdown (percentage of peak equity using backtest_capital), Avg Hold Time, Total Fees, Return/Risk ratio
- **Avg Hold Time** — computed from entry order timestamps as fallback for backtests where position `created_at` reflects wall-clock run time rather than the candle entry time
- **Exchange Filter** — filter all analytics sections by exchange, bot, symbol, or execution mode
- **Real-Time Charts** — TradingView lightweight-charts with indicator overlays on correct axis scales
- **Position & Order Tracking** — detailed P&L with explicit +/- signs, fee tracking, and trade history
- **Signal Recording** — every entry/exit signal stored with indicator snapshot values
- **CSV Export** — download trade history for external analysis

---

## Quick Start (Docker)

> Requires only [Docker Desktop](https://docs.docker.com/get-docker/). No Python, Node, or manual setup.

```bash
git clone https://github.com/Stenvro/ApexAlgo.git
cd ApexAlgo
docker compose up -d
```

First start takes ~2 minutes (builds images + compiles frontend). Subsequent starts are instant unless you need a full rebuild (see [Development Workflow](#development-workflow)).

| Service | URL |
| :--- | :--- |
| Frontend | `https://localhost:5173` |
| Backend API | `https://localhost:8000` |
| API Docs (Swagger) | `https://localhost:8000/docs` |

> Accept the self-signed certificate warning in your browser on first visit.
> For LAN access, you must also visit `https://YOUR-IP:8000` and accept the backend certificate — otherwise the browser blocks API requests from the frontend.

### Managing ApexAlgo

| Command | Description |
| :--- | :--- |
| `docker compose up -d` | Start (detached) |
| `docker compose down` | Stop |
| `docker compose logs -f` | View all logs |
| `docker compose logs -f backend` | Backend logs only |
| `docker compose logs -f frontend` | Frontend logs only |
| `docker compose build && docker compose up -d` | Full rebuild (after pulling new code or changing Dockerfiles / dependencies) |
| `docker compose restart backend` | Apply backend code changes (~3–5 sec) |

---

## Development Workflow

Source code is bind-mounted into the running containers so you can iterate without rebuilding the Docker images:

| Path | Mounted to | Effect |
| :--- | :--- | :--- |
| `./backend/` | `/app/backend/` | Restart container to apply changes |
| `./frontend/src/` | `/app/frontend/src/` | Requires a frontend rebuild trigger (see below) |

### Backend changes

After saving a backend file, restart the container:

```bash
docker compose restart backend
```

Changes take effect in ~3–5 seconds. Hot-reload (`--reload`) is intentionally disabled to avoid unnecessary restarts from bind-mounted volume events.

### Frontend changes

After saving any file under `frontend/src/`, trigger a Vite rebuild:

```bash
rm -f data/.frontend-env-hash && docker restart apexalgo-frontend-1
```

The rebuild takes ~10–15 seconds. nginx automatically serves the new bundle.

### Full image rebuild

Required when changing `package.json`, `requirements.txt`, Dockerfiles, or entrypoint scripts:

```bash
docker compose build && docker compose up -d
```

### Custom LAN Access

To access ApexAlgo from another device on your network, edit `data/.env`:

```env
VITE_API_BASE_URL=https://YOUR-LAN-IP:8000
```

Then delete old certs (so they regenerate with your IP in the SAN) and rebuild:

```bash
docker compose down
rm -f data/cert/cert.pem data/cert/key.pem
docker compose up -d --build
```

### Data Persistence

All data lives in the `data/` folder on your host (bind-mounted into both containers):

```
data/
├── ApexAlgoDB.sqlite3    ← database
├── .env                  ← secrets + config
└── cert/
    ├── cert.pem          ← SSL certificate
    └── key.pem           ← SSL key
```

This is the same `data/` folder used by the manual install scripts — both methods are interchangeable. Stopping containers never deletes data. To fully reset, delete `data/` and restart.

---

## Manual Installation (without Docker)

Setup scripts in `install/` run ApexAlgo directly on the host using `screen` sessions.

### Requirements

| Dependency | Version | Notes |
| :--- | :--- | :--- |
| Python | 3.11+ | Auto-installed if missing |
| Node.js | 18+ | Auto-installed if missing |
| mkcert | latest | Auto-installed if missing |
| screen | any | Auto-installed if missing |

### Setup

```bash
git clone https://github.com/Stenvro/ApexAlgo.git
cd ApexAlgo
chmod +x install/*.sh
./install/Setup.sh
./install/Start_ApexAlgo.sh
```

Services run in detached `screen` sessions:

```bash
screen -r apex_backend    # attach to backend
screen -r apex_frontend   # attach to frontend
```

- **Detach** (keep running): `Ctrl+A` then `D`
- **Stop process**: `Ctrl+C`

### Switching Between Docker and Screen Sessions

Both methods share the same `data/` directory (database, certs, `.env`). Use the switch script to move between them:

```bash
./install/Switch_Mode.sh
```

The script auto-detects which mode is currently running and switches to the other. It handles:
- SQLite WAL checkpoint before stopping (prevents data corruption)
- Cleanup of Docker artifacts (stale symlinks, build cache, cert ownership)
- Cleanup of bare-metal symlinks when switching back to Docker
- Health check after starting Docker

If nothing is running, it prompts which mode to start.

### Environment Variables

Both setup methods (Docker and manual) auto-generate a `.env` file with secure keys on first run. The only value you may need to edit:

```env
VITE_API_BASE_URL=https://<your-ip>:8000
```

This is pre-filled with your detected LAN IP (manual) or `localhost` (Docker). Change it if you access ApexAlgo from a different host.

| Variable | Description | Auto-generated |
| :--- | :--- | :--- |
| `MASTER_API_KEY` | Backend authentication key for all API requests | Yes |
| `DATABASE_URL` | SQLAlchemy database connection string | Yes |
| `ENCRYPTION_KEY` | Fernet key used to encrypt exchange API credentials at rest | Yes |
| `VITE_API_BASE_URL` | Backend base URL used by the frontend | Yes — verify if needed |
| `VITE_API_KEY` | API key sent by the frontend on every request | Yes |

---

## Architecture

```
ApexAlgo/
├── backend/
│   ├── core/
│   │   ├── database.py            # SQLAlchemy engine, WAL mode, session, idempotent migrations
│   │   ├── exchange_registry.py   # CCXT exchange factory for all supported exchanges
│   │   ├── bot_log_buffer.py      # Thin wrapper: push/get/clear bot logs in DB
│   │   ├── encryption.py          # Fernet credential encryption/decryption
│   │   ├── events.py              # Async event bus (CANDLE_CLOSED, BOT_STATE_CHANGED)
│   │   └── security.py            # API key authentication
│   ├── engine/
│   │   ├── bot_manager.py         # Core trading engine: backfill, live processing, order execution, indicator fingerprinting, drawdown caching
│   │   ├── candle_poller.py       # Universal multi-exchange REST polling with incremental backfill
│   │   ├── evaluator.py           # Node graph resolver using pandas_ta (memoized per evaluation cycle)
│   │   └── settings_validator.py  # Bot settings integrity checks
│   ├── models/
│   │   ├── bots.py                # BotConfig ORM
│   │   ├── bot_logs.py            # BotLog ORM — per-bot engine event log (persisted)
│   │   ├── positions.py           # Position ORM
│   │   ├── orders.py              # Order ORM
│   │   ├── signals.py             # Signal ORM
│   │   ├── candles.py             # Candle ORM (exchange-isolated)
│   │   └── exchange_keys.py       # ExchangeKey ORM
│   ├── routers/                   # API route handlers (bots, trades, data, keys)
│   └── main.py                    # App init, CORS, lifespan, migrations
├── frontend/
│   └── src/
│       ├── api/                   # Axios client with auth interceptor
│       └── components/
│           ├── Builder/           # Visual strategy editor (BotBuilder, CustomNodes, indicatorConfig)
│           ├── ChartEngine.jsx    # TradingView charts with indicator overlays
│           ├── BotManagerUI.jsx   # Bot cards: start/stop, console, export/import/duplicate
│           ├── BotConsole.jsx     # Per-bot live log console (polling, auto-scroll, level colors)
│           ├── DataManager.jsx    # Historical data download and management (multi-exchange)
│           ├── TradeManager.jsx   # Quant analytics: equity curve, buy & hold, 8-metric stats
│           └── Settings.jsx       # Exchange key management (multi-exchange)
├── docker/
│   ├── backend.Dockerfile         # Python 3.11 + FastAPI + uvicorn
│   ├── frontend.Dockerfile        # nginx + Node.js (builds frontend at startup)
│   ├── backend-entrypoint.sh      # Auto-generates .env + SSL certs, starts uvicorn
│   ├── frontend-entrypoint.sh     # Waits for .env, builds frontend, starts nginx
│   └── nginx.conf                 # SPA fallback + SSL on port 5173 + gzip compression
├── install/
│   ├── Setup.sh                   # Full setup (Python, Node, venv, deps, certs, .env)
│   ├── Start_ApexAlgo.sh          # Start backend + frontend in screen sessions
│   └── Switch_Mode.sh             # Switch between Docker and screen sessions
├── docker-compose.yml             # Two services: backend + frontend; bind-mounted source, resource limits
├── data/                          # Database, .env, SSL certs (gitignored)
├── requirements.txt
└── STRATEGY_CONTEXT.md            # AI prompt context for the visual strategy builder
```

---

## Data Flow

```
Strategy Builder (ReactFlow) ──serialize──> Bot Settings JSON
                                                │
                                          POST /api/bots/
                                                │
                                        Settings Validator
                                                │
                                           Save to DB
                                                │
                                     Bot Start ──> Backfill (historical backtest)
                                                │
                             CandlePoller (per exchange/symbol/timeframe)
                                  └── fetch_ohlcv polling ──> CANDLE_CLOSED event
                                                │
                                     NodeEvaluator resolves indicator → condition → logic
                                                │
                                     BotManager processes entries/exits
                                          │                  │
                                  bot_log_buffer          Exchange API
                                  (DB-persisted)       (CCXT paper/live)
                                          │
                          ┌───────────────┼──────────────────┐
                    Forward Test      Paper (Sandbox)      Live Exchange
                   (local simulation) (exchange sandbox)  (exchange production)
                                                │
                                     Position + Order + Signal ──> DB
                                                │
                            ┌───────────────────┴───────────────────┐
                     ChartEngine                              TradeManager
                  (TradingView signals)            (equity curve, buy & hold, stats)
                                                │
                                         BotManagerUI
                                    (live console via /logs polling)
```

---

## Bot Log Console

Each bot card in the Bot Manager has an expandable console panel. It streams the bot's engine output in real time by polling `GET /api/bots/{name}/logs?since={seq}` every 2 seconds while the panel is open — zero overhead when closed.

Logs are written to the `bot_logs` SQLite table by `bot_manager.py` at key execution points:

| Event | Level |
| :--- | :--- |
| Bot starting (symbol, timeframe, mode, lookback) | INFO |
| Waiting for candle data / data ready / data stalled | INFO / WARN |
| Backfill progress (every 100 candles) | INFO |
| Backfill complete (candle count + trade count) | INFO |
| Exchange limit reached (fewer candles than requested) | INFO |
| Running backtest on N candles | INFO |
| BUY filled / rejected / failed | INFO / WARN / ERROR |
| SELL filled / failed | INFO / ERROR |
| Max drawdown auto-stop | WARN |
| API key not found, falling back to forward_test | WARN |
| General strategy execution error | ERROR |

Log entries persist across backend restarts. Wiping the cache also clears the log buffer for that bot.

---

## Bot Export / Import / Duplicate

### Export
Click **Export** on any bot card to download a `.apex.json` file containing the bot's name, strategy graph, settings, and sandbox flag. Trade history and signals are not included.

```json
{
  "apex_version": "1.0",
  "exported_at": "2026-03-31T14:07:33Z",
  "bot": {
    "name": "My Strategy",
    "is_sandbox": true,
    "strategy": "<ReactFlow graph JSON>",
    "settings": { "timeframe": "1h", "symbols": ["BTC/USDT"] }
  }
}
```

### Import
Click **Import Bot** in the page header and select a `.apex.json` file. If the bot name already exists, `(imported)` is appended automatically. Bots imported without visual layout data (e.g. programmatically created) have their node graph automatically reconstructed in the editor.

### Duplicate
Click **Duplicate** on any stopped bot card to create a clone with `(copy)` appended to the name. The duplicate starts inactive with no trade history.

---

## Supported Exchanges

| Exchange | Passphrase | Sandbox | Notes |
| :--- | :--- | :--- | :--- |
| OKX | Yes | Yes | EU hostname (eea.okx.com) |
| Binance | No | Yes | |
| Bitvavo | No | No | EU exchange |
| Coinbase | No | No | |
| Crypto.com | No | No | |
| Kraken | No | No | |
| KuCoin | Yes | Yes | |

Adding support for any other CCXT-compatible exchange requires only adding it to the frontend dropdowns and `SUPPORTED_EXCHANGES` in `exchange_registry.py`.

---

## Security

- Exchange API keys are encrypted at rest using Fernet symmetric encryption
- All API endpoints require a bearer token (`X-API-Key` header) with timing-safe comparison
- TLS certificates are generated automatically (self-signed in Docker, mkcert in manual setup)
- `.env` is excluded from version control; secrets are auto-generated during setup
- Live order execution includes max order value safety guards
- Order fill status is validated after every exchange API call

---

## Disclaimer

ApexAlgo is experimental software. Algorithmic trading carries significant financial risk. This project is provided as-is, without warranty of any kind. Use at your own risk.

---

## License

This project does not currently have an open-source license. All rights reserved.
