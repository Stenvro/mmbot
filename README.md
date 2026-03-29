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

- **Visual Strategy Builder** — construct strategies using logic gates and indicator nodes via a drag-and-drop canvas
- **Async Execution Engine** — event-driven FastAPI backend with concurrent bot management
- **Real-Time Market Data** — WebSocket ingestion via CCXT (OKX supported)
- **Backtesting** — vectorized historical evaluation with PnL, win rate, and profit factor metrics
- **Risk Management** — tiered TP/SL, ATR trailing stops, trade cooldown, and position limits
- **Encrypted Key Storage** — exchange API credentials stored with Fernet symmetric encryption
- **Local HTTPS** — mkcert-based trusted development certificates

---

## Requirements

| Dependency | Version |
| :--- | :--- |
| Python | 3.11+ |
| Node.js | 18+ |
| mkcert | latest |
| screen | any |

---

## Setup and Start

```bash
git clone https://github.com/Stenvro/ApexAlgo.git
cd ApexAlgo
bash Setup.sh
./Start_ApexAlgo.sh
```

`Setup.sh` handles everything in one run:
- Detects or installs Python 3.11
- Creates the virtual environment and installs all dependencies
- Installs Node.js packages for the frontend
- Installs the mkcert local CA and generates development SSL certificates
- Creates a `.env` file with **auto-generated secure keys** — no manual key generation needed

After setup, only one value in `.env` may need editing:

```env
VITE_API_BASE_URL=https://<your-ip>:8000
```

This is pre-filled with your detected LAN IP. Change it if you access ApexAlgo from a different host or network. All other values are generated automatically and require no changes.

To regenerate SSL certificates, delete `.cert/cert.pem` and `.cert/key.pem` and re-run `bash Setup.sh`.

---

## Access

| Service | URL |
| :--- | :--- |
| Backend API | `https://localhost:8000` |
| Frontend | `https://localhost:5173` |
| API Docs | `https://localhost:8000/docs` |

---

## Managing Screen Sessions

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
│   ├── core/           # database, encryption, security
│   ├── engine/         # bot manager, evaluator, websocket streamer
│   ├── models/         # SQLAlchemy ORM models
│   ├── routers/        # API route handlers
│   └── main.py
├── frontend/
│   └── src/
│       ├── api/        # axios client
│       └── components/ # React UI components
├── data/               # SQLite database (gitignored)
├── .cert/              # TLS certificates (gitignored)
├── requirements.txt
├── Setup.sh
└── Start_ApexAlgo.sh
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
- All API endpoints require a bearer token (`X-API-Key` header)
- TLS certificates are generated locally via mkcert; `.cert/` is excluded from version control
- `.env` is excluded from version control

---

## Disclaimer

ApexAlgo is experimental software. Algorithmic trading carries significant financial risk. This project is provided as-is, without warranty of any kind. Use at your own risk.

---

## License

This project does not currently have an open-source license. All rights reserved.
