# ⚡ ApexAlgo
> **Advanced Visual Quantitative Trading Framework**

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![CCXT](https://img.shields.io/badge/CCXT-Integrated-orange?style=for-the-badge)

> 🚧 **Status: Alpha Release (v0.1.0-alpha.1)**  
> ApexAlgo is currently in an early development stage.  
> Features may change, stability is not guaranteed, and breaking changes can occur.  
> Intended for testing, experimentation, and early feedback.

---

## 📦 Release

**Version:** `v0.1.0-alpha.1`

This is the **first alpha release** of ApexAlgo.

### Included:
- FastAPI-based async backend engine  
- Node-based strategy evaluation system  
- WebSocket market data ingestion (CCXT)  
- React + Vite frontend  
- Local HTTPS development setup  
- Screen-based runtime management  

### Limitations:
- Not production-ready 
- API and schema may change  
- Limited test coverage  

---

## 🛠 Installation

Follow the steps below to set up ApexAlgo locally.

---

## ⚡ Quick Setup (Recommended)

Run the automated setup script:

```bash
chmod +x Setup.sh
./Setup.sh
```

This will:

- Install Python 3.11 if missing  
- Create or fix the virtual environment (`apexalgo_venv`)  
- Install backend dependencies  
- Install frontend dependencies  
- Generate SSL certificates (if missing)  
- Preserve existing `.env` configuration  

---

## 🧪 Manual Setup (Advanced)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/apexalgo.git
cd apexalgo
```

---

### 2. Create Python Virtual Environment

Requires **Python 3.11+**

```bash
python3 -m venv apexalgo_venv
```

Activate:

**Linux / macOS**
```bash
source apexalgo_venv/bin/activate
```

**Windows**
```bash
apexalgo_venv\Scripts\activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

---

### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

---

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
MASTER_API_KEY=your_secure_master_key
DATABASE_URL=sqlite:///./data/apexalgo.db
ENCRYPTION_KEY=your_fernet_key_here
VITE_API_BASE_URL=https://localhost:8000
VITE_API_KEY=your_master_api_key_for_the_frontend
```

---

### 5. Start ApexAlgo

```bash
chmod +x start_apex.sh
./start_apex.sh
```

---

## 🌐 Access

Backend API:
```
https://localhost:8000
```

Frontend:
```
https://localhost:5173
```

---

## 🖥 Managing Screen Sessions

View backend:

```bash
screen -r apex_backend
```

View frontend:

```bash
screen -r apex_frontend
```

Detach (leave running):

```
CTRL + A → D
```

Stop process:

```
CTRL + C
```

---

## 🔐 HTTPS (Development)

ApexAlgo uses **self-signed SSL certificates** for local development.

- Stored in `.cert/`
- Generated automatically by `Setup.sh`
- Used by both backend and frontend (Vite config)

---

## 🚀 Technical Core Capabilities

### 1. Visual Logic Synthesis (Node-Based UI)
The frontend utilizes a custom implementation of React Flow to provide a powerful visual canvas for strategy architecture.

* **Logical Gate Primitives:** Integrate `AND`, `OR`, `XOR`, and `NOT` gates to create multi-conditioned entry and exit signals.  
* **Data Pipeline Routing:** Direct technical indicator outputs (SMA, EMA, RSI, MACD, etc.) through conditional operators.  
* **Modular Design:** Strategies are saved as structured JSON schemas.  

---

### 2. High-Performance Execution Engine
The backend is a high-concurrency event-driven system built on FastAPI and Python 3.11+.

* **Asynchronous Market Ingestion:** Real-time data via WebSockets and CCXT  
* **Vectorized Evaluation:** High-speed processing using Pandas  
* **Multi-Asset Management:** Multiple symbols and timeframes per bot  

---

### 3. Institutional Risk Management

* **Tiered Exits:** Multiple TP/SL levels  
* **ATR Trailing:** Volatility-based trailing stops  
* **Trade Cooldown:** Limit entries per candle window  
* **Position Guarding:** Per-pair or global position limits  

---

### 4. Vectorized Backtesting & Analytics

* **Historical Reconstruction:** Backtest large datasets  
* **Metrics:** Net PnL, Win Rate, Profit Factor  
* **Execution Ledger:** Full trade history  

---

## 🧠 System Architecture

### Backend (Python)

* **BotManager:** Bot lifecycle orchestration  
* **NodeEvaluator:** Recursive graph execution engine  
* **SQLAlchemy ORM:** Persistent storage  
* **Fernet Encryption:** Secure API key storage  

### Frontend (React)

* Real-time WebSocket dashboard  
* Node-based strategy builder  
* Interactive charting  

---

## 📂 Directory Structure

```text
ApexAlgo/
├── backend/
│   ├── core/
│   ├── engine/
│   ├── models/
│   ├── routes/
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── Builder/
│   │   └── api/
│   └── package.json
├── data/
├── .cert/
├── requirements.txt
├── Setup.sh
├── start_apex.sh
└── README.md
```

---

## ⚙️ Environment Configuration

| Variable | Description |
| :--- | :--- |
| `MASTER_API_KEY` | Backend authentication key |
| `DATABASE_URL` | Database connection string |
| `ENCRYPTION_KEY` | Fernet encryption key |
| `VITE_API_BASE_URL` | Backend API endpoint |

---

## 🛡️ Security Protocol

* API keys are encrypted at rest  
* Strategies validated before execution  
* Token-based API access  

---

## ⚠️ Disclaimer

ApexAlgo is experimental trading software.

Algorithmic trading involves significant financial risk.  
Use at your own risk.

---

## 🧪 Development Notes

This is an **alpha release** focused on:

- Architecture validation  
- Strategy engine design  
- Performance testing  

Expect:

- Breaking changes  
- Rapid iteration  
- Incomplete features  

---