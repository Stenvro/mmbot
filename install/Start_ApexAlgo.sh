#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CERT_FILE="data/cert/cert.pem"
KEY_FILE="data/cert/key.pem"

########################################
# Pre-flight checks
########################################

ABORT=0

if [ ! -f "data/.env" ]; then
    echo "ERROR: data/.env not found. Run bash install/Setup.sh first."
    ABORT=1
fi

if [ ! -d "apexalgo_venv" ]; then
    echo "ERROR: Virtual environment not found. Run bash install/Setup.sh first."
    ABORT=1
fi

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "ERROR: SSL certificate files not found. Run bash install/Setup.sh first."
    ABORT=1
fi

if [ "$ABORT" -eq 1 ]; then
    exit 1
fi

if grep -q "change_me" data/.env 2>/dev/null; then
    echo "WARNING: .env contains placeholder values. Edit .env before starting."
    exit 1
fi

########################################
# Stop any existing sessions
########################################

for session in apex_backend apex_frontend; do
    if screen -list | grep -q "$session"; then
        echo "Stopping existing session: $session"
        screen -S "$session" -X quit 2>/dev/null || true
    fi
done

########################################
# Start services
########################################

# Ensure symlinks exist for app code compatibility
ln -sf data/.env .env
ln -sf data/cert .cert

echo "Starting ApexAlgo..."

screen -dmS apex_backend bash -c "
cd '$ROOT_DIR' &&
source apexalgo_venv/bin/activate &&
uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --ssl-keyfile '$KEY_FILE' \
  --ssl-certfile '$CERT_FILE';
exec bash
"

screen -dmS apex_frontend bash -c "
cd '$ROOT_DIR/frontend' &&
npm run dev -- --host 0.0.0.0;
exec bash
"

########################################
# Done
########################################

# Read VITE_API_BASE_URL from .env for display
BACKEND_URL=$(grep '^VITE_API_BASE_URL=' data/.env | cut -d'=' -f2 || echo "https://localhost:8000")

echo ""
echo "--------------------------------"
echo "ApexAlgo is running."
echo ""
echo "  Backend  : ${BACKEND_URL}"
echo "  Frontend : https://localhost:5173"
echo "  API Docs : ${BACKEND_URL}/docs"
echo ""
echo "  screen -r apex_backend    — attach to backend"
echo "  screen -r apex_frontend   — attach to frontend"
echo "  Ctrl+A, D                 — detach (keep running)"
echo "  Ctrl+C                    — stop process"
echo "--------------------------------"
