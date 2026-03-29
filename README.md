# ApexAlgo

> **Advanced Visual Quantitative Trading Framework**

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![CCXT](https://img.shields.io/badge/CCXT-Integrated-orange?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Alpha-yellow?style=for-the-badge)

ApexAlgo is a full-stack algorithmic trading platform for building, backtesting, and executing systematic trading strategies — without writing code. A node-based visual strategy builder connects directly to a high-performance async execution engine with real-time market data and encrypted exchange key management.

> **Alpha release — not production-ready.** APIs and data schemas may change between versions.

---

## Features

### Strategy Builder
- **Visual Node Editor** — drag-and-drop canvas with 51+ technical indicators, logic gates, conditions, and action nodes
- **No-Code Strategy Design** — connect indicator, condition, and logic nodes to build complex entry/exit rules
- **ReactFlow Graph Serialization** — strategies are compiled to JSON and evaluated per candle

### Execution Engine
- **Three Execution Modes** — forward test (simulated), paper trading (sandbox API), and live exchange execution
- **Async Event-Driven Architecture** — FastAPI backend with concurrent bot management via asyncio
- **Real-Time Market Data** — WebSocket ingestion from OKX with automatic reconnection
- **CCXT Integration** — exchange-agnostic order execution with market precision handling

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
- **Local TLS** — mkcert-generated trusted development certificates
- **Environment Isolation** — secrets auto-generated during setup, never committed

### Analytics
- **Real-Time Charts** — TradingView lightweight-charts with indicator overlays on correct axis scales
- **Position & Order Tracking** — detailed P&L, fee tracking, and trade history
- **Signal Recording** — every entry/exit signal stored with indicator snapshot values
- **CSV Export** — download trade history for external analysis

---

## Requirements

| Dependency | Version | Notes |
| :--- | :--- | :--- |
| Python | 3.11+ | |
| Node.js | 18+ | |
| mkcert | latest | Installed automatically |
| screen | any | Linux only |

---

## Setup and Start

Both setup scripts handle everything in one run: install dependencies, create the Python virtual environment, install packages, generate trusted SSL certificates via mkcert, and create a `.env` file with **auto-generated secure keys**.

After setup, only one value in `.env` may need editing:

```env
VITE_API_BASE_URL=https://<your-ip>:8000
```

This is pre-filled with your detected LAN IP. Change it if you access ApexAlgo from a different host or network.

### Linux — Ubuntu / Debian / Arch / Raspberry Pi

```bash
git clone https://github.com/Stenvro/ApexAlgo.git
cd ApexAlgo
chmod +x Setup.sh Start_ApexAlgo.sh
./Setup.sh
./Start_ApexAlgo.sh
```

Services run in detached `screen` sessions (see [Managing Screen Sessions](#managing-screen-sessions) below).

To regenerate SSL certificates, delete `.cert/cert.pem` and `.cert/key.pem` and re-run `./Setup.sh`.

### Windows — PowerShell

```powershell
git clone https://github.com/Stenvro/ApexAlgo.git
cd ApexAlgo
powershell -ExecutionPolicy Bypass -File .\Setup.ps1
.\Start_ApexAlgo.ps1
```

`Setup.ps1` uses **winget** to install Python, Node.js, and mkcert if they are not already present.

`Start_ApexAlgo.ps1` opens two separate PowerShell windows — one for the backend, one for the frontend. Close a window to stop that service.

To regenerate SSL certificates, delete `.cert\cert.pem` and `.cert\key.pem` and re-run `.\Setup.ps1`.

---

## Access

| Service | URL |
| :--- | :--- |
| Backend API | `https://localhost:8000` |
| Frontend | `https://localhost:5173` |
| API Docs (Swagger) | `https://localhost:8000/docs` |

---

## Managing Screen Sessions

> Linux only. Windows uses separate PowerShell windows instead.

ApexAlgo runs in detached `screen` sessions.

```bash
screen -r apex_backend    # attach to backend
screen -r apex_frontend   # attach to frontend
```

- **Detach** (keep running): `Ctrl+A` then `D`
- **Stop process**: `Ctrl+C`

---

## Architecture

```
ApexAlgo/
├── backend/
│   ├── core/              # database, encryption, security, event bus
│   ├── engine/
│   │   ├── bot_manager.py     # core trading engine: backfill, live processing, order execution
│   │   ├── evaluator.py       # node graph resolver using pandas_ta
│   │   ├── settings_validator.py  # bot settings integrity checks
│   │   └── websocket_streamer.py  # OKX WebSocket data ingestion
│   ├── models/            # SQLAlchemy ORM (BotConfig, Position, Order, Signal, Candle, ExchangeKey)
│   ├── routers/           # API route handlers (bots, trades, data, keys)
│   └── main.py            # app init, CORS, lifespan, migrations
├── frontend/
│   └── src/
│       ├── api/           # axios client with auth interceptor
│       └── components/
│           ├── Builder/       # visual strategy editor (BotBuilder, CustomNodes, indicatorConfig)
│           ├── ChartEngine.jsx    # TradingView charts with indicator overlays
│           ├── BotManagerUI.jsx   # bot list, start/stop controls
│           ├── TradeManager.jsx   # position/order analytics, P&L tracking
│           └── Settings.jsx       # exchange key management
├── data/                  # SQLite database (gitignored)
├── .cert/                 # TLS certificates (gitignored)
├── requirements.txt
├── Setup.sh / Setup.ps1           # one-command setup (Linux / Windows)
└── Start_ApexAlgo.sh / .ps1       # one-command start (Linux / Windows)
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
                                     WebSocket ──> CANDLE_CLOSED event
                                                │
                                     NodeEvaluator resolves indicator → condition → logic
                                                │
                                     BotManager processes entries/exits
                                                │
                          ┌─────────────────────┼─────────────────────┐
                    Forward Test           Paper (Sandbox)          Live Exchange
                   (local simulation)     (OKX sandbox API)       (OKX production)
                                                │
                                     Position + Order + Signal ──> DB
                                                │
                                     ChartEngine + TradeManager ──> UI
```

---

## Environment Variables

| Variable | Description | Auto-generated |
| :--- | :--- | :--- |
| `MASTER_API_KEY` | Backend authentication key for all API requests | Yes |
| `DATABASE_URL` | SQLAlchemy database connection string | Yes |
| `ENCRYPTION_KEY` | Fernet key used to encrypt exchange API credentials at rest | Yes |
| `VITE_API_BASE_URL` | Backend base URL used by the frontend | Yes — verify if needed |
| `VITE_API_KEY` | API key sent by the frontend on every request | Yes |

---

## Security

- Exchange API keys are encrypted at rest using Fernet symmetric encryption
- All API endpoints require a bearer token (`X-API-Key` header) with timing-safe comparison
- TLS certificates are generated locally via mkcert; `.cert/` is excluded from version control
- `.env` is excluded from version control; secrets are auto-generated during setup
- Live order execution includes max order value safety guards
- Order fill status is validated after every exchange API call

---

## Disclaimer

ApexAlgo is experimental software. Algorithmic trading carries significant financial risk. This project is provided as-is, without warranty of any kind. Use at your own risk.

---

## License

This project does not currently have an open-source license. All rights reserved.
