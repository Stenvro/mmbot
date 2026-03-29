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

## Quick Setup

```bash
git clone https://github.com/Stenvro/ApexAlgo.git
cd ApexAlgo
chmod +x Setup.sh
./Setup.sh
```

`Setup.sh` will:
- Detect or install Python 3.11
- Create the virtual environment (`apexalgo_venv`)
- Install backend and frontend dependencies
- Install the local mkcert CA and generate development SSL certificates
- Create a `.env` file with placeholder values if one does not exist

---

## Manual Setup

### 1. Python Virtual Environment

```bash
python3.11 -m venv apexalgo_venv
source apexalgo_venv/bin/activate   # Linux / macOS
# apexalgo_venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

### 2. Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 3. Environment Variables

Create a `.env` file in the project root:

```env
MASTER_API_KEY=your_secure_master_key
DATABASE_URL=sqlite:///./data/apexalgo.db
ENCRYPTION_KEY=your_fernet_key_here
VITE_API_BASE_URL=https://localhost:8000
VITE_API_KEY=your_secure_master_key
```

To generate a valid Fernet encryption key:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 4. SSL Certificates

Certificates are generated automatically by `Setup.sh` using mkcert. To regenerate manually:

```bash
mkcert -install
mkcert -key-file .cert/key.pem -cert-file .cert/cert.pem localhost 127.0.0.1
```

### 5. Start

```bash
chmod +x Start_ApexAlgo.sh
./Start_ApexAlgo.sh
```

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

| Variable | Description |
| :--- | :--- |
| `MASTER_API_KEY` | Backend authentication key for all API requests |
| `DATABASE_URL` | SQLAlchemy database connection string |
| `ENCRYPTION_KEY` | Fernet key used to encrypt exchange API credentials at rest |
| `VITE_API_BASE_URL` | Backend base URL used by the frontend |
| `VITE_API_KEY` | API key sent by the frontend on every request |

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
