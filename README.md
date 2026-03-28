# ⚡ ApexAlgo
> **Advanced Visual Quantitative Trading Framework**

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![CCXT](https://img.shields.io/badge/CCXT-Integrated-orange?style=for-the-badge)

**ApexAlgo** is a professional-grade, full-stack algorithmic trading platform designed for the systematic development, backtesting, and execution of complex trading strategies. 

By combining a high-performance asynchronous Python engine with a sophisticated node-based visual logic builder, ApexAlgo bridges the gap between discretionary trading and institutional quantitative execution. Unlike traditional linear scripts, ApexAlgo utilizes a **recursive graph-evaluation matrix**, allowing traders to construct non-linear strategy architectures without writing a single line of code.

---

## 🚀 Technical Core Capabilities

### 1. Visual Logic Synthesis (Node-Based UI)
The frontend utilizes a custom implementation of React Flow to provide a powerful visual canvas for strategy architecture.
*   **Logical Gate Primitives:** Integrate `AND`, `OR`, `XOR`, and `NOT` gates to create multi-conditioned entry and exit signals.
*   **Data Pipeline Routing:** Direct technical indicator outputs (SMA, EMA, RSI, MACD, etc.) through conditional operators to build complex market state filters.
*   **Modular Design:** Strategies are saved as structured JSON schemas, enabling rapid iteration, version control, and easy sharing.

### 2. High-Performance Execution Engine
The backend is a high-concurrency event-driven system built on FastAPI and Python 3.11+.
*   **Asynchronous Market Ingestion:** Real-time data synchronization via native WebSockets and CCXT integration.
*   **Vectorized Evaluation:** Market data is processed using Pandas for high-speed signal generation and strategy evaluation.
*   **Multi-Asset Management:** Concurrently monitor multiple symbols across different timeframes within a single bot instance.

### 3. Institutional Risk Management
ApexAlgo features a robust risk mitigation layer that goes beyond simple static exits.
*   **Tiered Exits:** Configure multiple Take Profit and Stop Loss levels with independent quantity distributions.
*   **Volatility-Adjusted Trailing (ATR):** Advanced trailing logic that uses the Average True Range to dynamically adjust exit buffers based on real-time market volatility.
*   **Trade Cooldown (Anti-Spam):** Integrated logic to limit *Max New Entries per X Candles*, preventing over-exposure during high-frequency market noise.
*   **Position Guarding:** Sophisticated max-position logic scoped either per-pair or globally across the entire wallet.

### 4. Vectorized Backtesting & Analytics
*   **Historical Reconstruction:** Instantly validate visual strategies against massive historical datasets with automatic pagination and lookback construction.
*   **Quantitative Metrics:** Real-time calculation of Net PnL, Win Rate, Profit Factor, and Average Win/Loss ratios.
*   **Execution Ledger:** Full transparency through a detailed historical ledger and raw execution logs.

---

## 🧠 System Architecture

The platform architecture is strictly designed for modularity, low latency, and maximum security.

### Backend (Python)
*   **BotManager:** The central orchestrator managing bot lifecycles and real-time event loops.
*   **NodeEvaluator:** A recursive logic engine that resolves graph-based strategy nodes into executable boolean matrices.
*   **SQLAlchemy ORM:** Secure persistent storage for historical candle data, bot configurations, and order history.
*   **Fernet Security:** All exchange credentials (API Keys/Secrets) are symmetrically encrypted at rest using industry-standard cryptography.

### Frontend (React)
*   **State Management:** Real-time dashboard updates via native WebSocket connections to the backend.
*   **Data Density UI:** A dark-themed, industrial interface heavily optimized for traders requiring high data visibility and zero clutter.
*   **Dynamic Charting:** Interactive charting engine featuring real-time execution plotting and indicator overlays.

---

## 📂 Directory Structure

```text
ApexAlgo/
├── backend/
│   ├── core/           # Database configuration, Security, and Event Bus
│   ├── engine/         # The "Brain" (BotManager, Evaluator, Matrix logic)
│   ├── models/         # Database Schemas (Positions, Orders, Candles, Bots)
│   ├── routes/         # API Endpoints (REST & WebSockets)
│   └── main.py         # Application Entry Point
├── frontend/
│   ├── src/
│   │   ├── components/ # Dashboard, Analytics, and Trading UI
│   │   ├── Builder/    # Visual Logic Engine (React Flow)
│   │   └── api/        # Persistent API Client
│   └── package.json    # Frontend dependency tree
├── data/               # Persistent SQLite storage (Docker Volume)
└── requirements.txt    # Backend dependency tree
```

---

## ⚙️ Environment Configuration

ApexAlgo requires a `.env` file in the root directory. This configuration is critical for security and system connectivity.

| Variable | Description |
| :--- | :--- |
| `MASTER_API_KEY` | Backend authentication key for secure API access. |
| `DATABASE_URL` | Connection string (Default: `sqlite:////app/data/apexalgo.db`). |
| `ENCRYPTION_KEY` | 32-byte key for Fernet credential encryption. |
| `VITE_API_BASE_URL` | The API endpoint routing for the React frontend. |

---

## 🛡️ Security Protocol

*   **At-Rest Encryption:** Exchange API secrets are never stored in plain text.
*   **Encapsulated Logic:** Visual strategies are validated against a strict JSON schema before being injected into the execution engine.
*   **Token-Based Access:** All frontend requests require a valid `MASTER_API_KEY` to communicate with the quant engine, preventing unauthorized remote access.

---

> **⚠️ Disclaimer**  
> *ApexAlgo is a trading software framework and does not constitute financial advice. Algorithmic trading involves a high risk of capital loss. The developers are not liable for financial losses incurred through the use of this software. Users must thoroughly backtest strategies and utilize paper-trading modes before deploying real capital. Use of this framework is strictly at your own risk.*