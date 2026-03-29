# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

```bash
# Full setup (first time)
./Setup.sh

# Start all services (backend + frontend in screen sessions)
./Start_ApexAlgo.sh

# Attach to running services
screen -r apex_backend
screen -r apex_frontend

# Run backend manually (from repo root, venv activated)
source apexalgo_venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile .cert/key.pem --ssl-certfile .cert/cert.pem

# Run frontend manually
cd frontend && npm run dev -- --host 0.0.0.0

# Lint frontend
cd frontend && npm run lint
```

There are no automated tests. The backend is validated manually via the FastAPI docs at `https://localhost:8000/docs`.

## Required environment

`.env` in the repo root must exist before starting. Generate a valid Fernet key with:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

The app raises a `ValueError` at startup if `MASTER_API_KEY` or `ENCRYPTION_KEY` are missing.

## Architecture

The backend is a **FastAPI** app (`backend/main.py`) with two long-running background services started via the lifespan context manager.

### Data flow

```
OKX WebSocket ──► OKXStreamer ──► Candle table ──► CANDLE_CLOSED event
                                                         │
                                                    BotManager
                                                         │
                                              NodeEvaluator (per bot)
                                                         │
                                              Signal / Order / Position tables
```

### Background services (`backend/engine/`)

- **`OKXStreamer`** (`websocket_streamer.py`) — connects to OKX WebSocket, backfills historical candles on startup, saves incoming candles to the DB, and fires `CANDLE_CLOSED` events via the `EventBus`. Reconnects automatically when bot configuration changes.

- **`BotManager`** (`bot_manager.py`) — listens for `CANDLE_CLOSED` events. On each closed candle it fetches the latest candle window from the DB, runs `NodeEvaluator` for every active bot matching that symbol/timeframe, and executes buy/sell logic. Also runs a backfill routine at startup and when a bot is activated.

### Strategy evaluation (`backend/engine/evaluator.py`)

`NodeEvaluator` receives a bot's `settings` JSON. It builds a Pandas DataFrame of indicators using `pandas_ta_classic`, then resolves a node graph (stored in `settings["nodes"]`) recursively. Node classes:
- `indicator` — maps to a `pandas_ta` method (RSI, EMA, MACD, etc.)
- `price_data` — raw OHLCV column with optional offset
- `condition` — comparison operator between two operands (supports `cross_above`, `cross_below`, etc.)
- `logic` — boolean gate: `and`, `or`, `xor`, `nand`, `nor`, `not`

`settings["entry_node"]` and `settings["exit_node"]` point to the root node IDs that produce the entry/exit boolean series.

### Bot execution modes

Each bot run resolves to one of three modes:
- `forward_test` — signals only, no orders placed on exchange
- `paper` — orders placed on OKX sandbox
- `live` — orders placed on OKX production (`eea.okx.com`)

Mode is determined by whether `api_execution` is set in settings and whether the linked `ExchangeKey` has `is_sandbox=True`.

### Event bus (`backend/core/events.py`)

`EventBus` is a simple pub/sub built on `asyncio.Queue`. Singleton exported as `event_bus`. Events used: `CANDLE_CLOSED`, `BOT_STATE_CHANGED`.

### Database

SQLite via SQLAlchemy ORM. DB file at `data/ApexAlgoDB.sqlite3` (gitignored). Tables: `bots`, `candles`, `signals`, `orders`, `positions`, `exchange_keys`, `preferences`. All tables are created on startup via `Base.metadata.create_all()`.

Exchange API credentials (`ExchangeKey`) are stored encrypted with Fernet. Always use `encrypt_data` / `decrypt_data` from `backend/core/encryption.py` when reading or writing these fields.

### API

All routes require the `X-API-Key` header matching `MASTER_API_KEY`. Routers:
- `keys` — CRUD for exchange API keys
- `bots` — CRUD + start/stop for bots
- `data` — candle and signal data for the frontend charts
- `trades` — order and position history

### Frontend (`frontend/src/`)

React + Vite + Tailwind. The Axios client (`api/client.js`) reads `VITE_API_BASE_URL` and `VITE_API_KEY` from `.env` via Vite's `envDir: '../'` setting — both must be set. Key components:
- `Builder/BotBuilder.jsx` + `Builder/CustomNodes.jsx` — React Flow canvas that serialises the node graph into the `settings` JSON format consumed by `NodeEvaluator`
- `ChartEngine.jsx` — lightweight-charts price + indicator display
- `Settings.jsx` — exchange key management form
- `BotManagerUI.jsx` — bot list with start/stop controls
