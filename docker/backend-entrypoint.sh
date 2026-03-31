#!/bin/bash
set -euo pipefail
cd /app

mkdir -p /app/data/cert

# ── 1. Generate .env if missing ──
if [ ! -f /app/data/.env ]; then
    API_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    ENC_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

    # In Docker, hostname -I returns the container IP (useless for LAN access).
    # Default to localhost; override with VITE_API_BASE_URL env var for LAN access.
    BASE_URL="${VITE_API_BASE_URL:-https://localhost:8000}"

    cat > /app/data/.env <<EOF
MASTER_API_KEY=${API_KEY}
DATABASE_URL=sqlite:///./data/ApexAlgoDB.sqlite3
ENCRYPTION_KEY=${ENC_KEY}
VITE_API_BASE_URL=${BASE_URL}
VITE_API_KEY=${API_KEY}
EOF
    echo "[backend] Generated new .env"
    echo "[backend] VITE_API_BASE_URL=${BASE_URL}"
    echo "[backend] For LAN access, edit data/.env and restart"
else
    echo "[backend] Using existing .env"
fi

# ── 2. Generate SSL certs if missing ──
if [ ! -f /app/data/cert/cert.pem ] || [ ! -f /app/data/cert/key.pem ]; then
    # Extract host/IP from VITE_API_BASE_URL in .env so the cert SAN matches
    SAN="DNS:localhost,IP:127.0.0.1"
    API_HOST=$(grep '^VITE_API_BASE_URL=' /app/data/.env | sed 's|.*://||;s|:.*||' 2>/dev/null || true)
    if [ -n "$API_HOST" ] && [ "$API_HOST" != "localhost" ]; then
        # Check if it looks like an IP address
        if echo "$API_HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
            SAN="${SAN},IP:${API_HOST}"
        else
            SAN="${SAN},DNS:${API_HOST}"
        fi
    fi

    openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
        -keyout /app/data/cert/key.pem \
        -out /app/data/cert/cert.pem \
        -days 365 -subj "/CN=localhost" \
        -addext "subjectAltName=${SAN}" 2>/dev/null
    echo "[backend] Generated SSL certificates (SAN: ${SAN})"
else
    echo "[backend] Using existing SSL certificates"
fi

# Symlinks so find_dotenv() and uvicorn find files at expected paths
ln -sf /app/data/.env /app/.env
ln -sf /app/data/cert /app/.cert

echo "[backend] Starting on https://0.0.0.0:8000"
exec uvicorn backend.main:app \
    --host 0.0.0.0 --port 8000 \
    --ssl-keyfile /app/.cert/key.pem \
    --ssl-certfile /app/.cert/cert.pem
