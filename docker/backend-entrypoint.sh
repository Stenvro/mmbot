#!/bin/bash
set -euo pipefail
cd /app

# ── 1. Generate .env if missing ──
if [ ! -f /app/data/.env ]; then
    API_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    ENC_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    BASE_URL="${VITE_API_BASE_URL:-https://localhost:8000}"
    cat > /app/data/.env <<EOF
MASTER_API_KEY=${API_KEY}
DATABASE_URL=sqlite:///./data/ApexAlgoDB.sqlite3
ENCRYPTION_KEY=${ENC_KEY}
VITE_API_BASE_URL=${BASE_URL}
VITE_API_KEY=${API_KEY}
EOF
    echo "[backend] Generated new .env with fresh keys"
fi

# Symlink so find_dotenv() finds it at /app/.env
ln -sf /app/data/.env /app/.env

# ── 2. Generate SSL certs if missing ──
mkdir -p /app/data/cert
if [ ! -f /app/data/cert/cert.pem ] || [ ! -f /app/data/cert/key.pem ]; then
    openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
        -keyout /app/data/cert/key.pem \
        -out /app/data/cert/cert.pem \
        -days 365 -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
    echo "[backend] Generated self-signed SSL certificates"
fi
ln -sf /app/data/cert /app/.cert

echo "[backend] Starting on https://0.0.0.0:8000"
exec uvicorn backend.main:app \
    --host 0.0.0.0 --port 8000 \
    --ssl-keyfile /app/.cert/key.pem \
    --ssl-certfile /app/.cert/cert.pem
