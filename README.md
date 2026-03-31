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
- **Cache Wipe** — clears chart signals and resets the bot's log buffer in one operation

### Backtesting
- **Vectorized Historical Evaluation** — fast backtest over configurable lookback periods
- **Fee-Adjusted P&L** — entry/exit fees and slippage applied to all profit calculations
- **Automatic Position Closure** — open positions at backtest end are closed at last price with proper P&L

### Risk Management
- **Tiered Take Profit / Stop Loss** — multiple TP/SL levels with percentage or fixed close amounts
- **ATR & Trailing Stops** — dynamic stop-loss adjustment based on price action
- **Trade Cooldown** — configurable max entries per N candles
- **Position Limits** — per-pair or global max concurrent positions
- **Max Drawdown Auto-Stop** — halts bot when cumulative drawdown exceeds threshold
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
- **Buy & Hold Comparison** — per-symbol strategy return vs. passive buy-and-hold using live price polling
- **8-Metric Stats Strip** — Net P&L, Win Rate, Profit Factor, Max Drawdown, Total Trades, Avg Hold Time, Total Fees, Return/Risk ratio
- **Exchange Filter** — filter all analytics sections by exchange, bot, symbol, or execution mode
- **Real-Time Charts** — TradingView lightweight-charts with indicator overlays on correct axis scales
- **Position & Order Tracking** — detailed P&L, fee tracking, and trade history
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

First start takes ~2 minutes (builds images + compiles frontend). Subsequent starts are instant.

| Service | URL |
| :--- | :--- |
| Frontend | `https://localhost:5173` |
| Backend API | `https://localhost:8000` |
| API Docs (Swagger) | `https://localhost:8000/docs` |

> Accept the self-signed certificate warning in your browser on first visit.

### Managing ApexAlgo

| Command | Description |
| :--- | :--- |
| `docker compose up -d` | Start (detached) |
| `docker compose down` | Stop |
| `docker compose logs -f` | View all logs |
| `docker compose logs -f backend` | Backend logs only |
| `docker compose logs -f frontend` | Frontend logs only |
| `docker compose up -d --build` | Rebuild images (after pulling new code) |

### Custom LAN Access

To access ApexAlgo from another device on your network:

```bash
VITE_API_BASE_URL=https://YOUR-IP:8000 docker compose up -d --build
```

This rebuilds the frontend with the correct API URL.

### Data Persistence

All data is stored in a Docker volume (`apexalgo-data`):
- Database, encryption keys, API keys, SSL certificates

| Command | Effect |
| :--- | :--- |
| `docker compose down` | Stops containers — **data preserved** |
| `docker compose down -v` | Stops containers — **data destroyed** |

### Migrate Existing Data into Docker

If you have an existing non-Docker setup with data:

```bash
docker run --rm -v apexalgo-data:/data -v $(pwd):/host alpine sh -c "
  cp /host/data/ApexAlgoDB.sqlite3 /data/
  cp /host/.env /data/.env
  mkdir -p /data/cert
  cp /host/.cert/*.pem /data/cert/
  echo Done"
```

---

## Manual Installation (without Docker)

Legacy setup scripts are available in the `install/` folder for running ApexAlgo directly on the host machine.

### Requirements

| Dependency | Version | Notes |
| :--- | :--- | :--- |
| Python | 3.11+ | |
| Node.js | 18+ | |
| mkcert | latest | Installed automatically |
| screen | any | Linux only |

### Linux — Ubuntu / Debian / Arch / Raspberry Pi

```bash
git clone https://github.com/Stenvro/ApexAlgo.git
cd ApexAlgo
chmod +x install/Setup.sh install/Start_ApexAlgo.sh
bash install/Setup.sh
bash install/Start_ApexAlgo.sh
```

Services run in detached `screen` sessions:

```bash
screen -r apex_backend    # attach to backend
screen -r apex_frontend   # attach to frontend
```

- **Detach** (keep running): `Ctrl+A` then `D`
- **Stop process**: `Ctrl+C`

### Windows — PowerShell

```powershell
git clone https://github.com/Stenvro/ApexAlgo.git
cd ApexAlgo
powershell -ExecutionPolicy Bypass -File .\install\Setup.ps1
.\install\Start_ApexAlgo.ps1
```

`Setup.ps1` uses **winget** to install Python, Node.js, and mkcert if they are not already present. `Start_ApexAlgo.ps1` opens two separate PowerShell windows — one for the backend, one for the frontend.

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
│   │   ├── database.py            # SQLAlchemy engine, session, idempotent migrations
│   │   ├── exchange_registry.py   # CCXT exchange factory for all supported exchanges
│   │   ├── bot_log_buffer.py      # Thin wrapper: push/get/clear bot logs in DB
│   │   ├── encryption.py          # Fernet credential encryption/decryption
│   │   ├── events.py              # Async event bus (CANDLE_CLOSED, BOT_STATE_CHANGED)
│   │   └── security.py            # API key authentication
│   ├── engine/
│   │   ├── bot_manager.py         # Core trading engine: backfill, live processing, order execution
│   │   ├── candle_poller.py       # Universal multi-exchange REST polling
│   │   ├── evaluator.py           # Node graph resolver using pandas_ta
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
│   └── nginx.conf                 # SPA fallback + SSL on port 5173
├── install/
│   ├── Setup.sh / Setup.ps1              # Legacy setup (Linux / Windows)
│   └── Start_ApexAlgo.sh / .ps1          # Legacy start (Linux / Windows)
├── docker-compose.yml             # Two services: backend + frontend
├── data/                          # SQLite database (gitignored)
├── .cert/                         # TLS certificates (gitignored)
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
| Waiting for candle data / data ready / data stalled | INFO / WARN |
| Backfill complete or error | INFO / ERROR |
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
Click **Import Bot** in the page header and select a `.apex.json` file. If the bot name already exists, `(imported)` is appended automatically.

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
