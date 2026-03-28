#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

CERT_FILE=".cert/cert.pem"
KEY_FILE=".cert/key.pem"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "❌ SSL certificate files not found:"
    echo "   $CERT_FILE"
    echo "   $KEY_FILE"
    echo ""
    echo "Run ./Setup.sh first."
    exit 1
fi

if [ ! -d "apexalgo_venv" ]; then
    echo "❌ Virtual environment not found. Run ./Setup.sh first."
    exit 1
fi

echo "🚀 Starting APEX ALGO in Screen sessions..."

echo "-> Starting Backend in screen 'apex_backend'..."
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

echo "-> Starting Frontend in screen 'apex_frontend'..."
screen -dmS apex_frontend bash -c "
cd '$ROOT_DIR/frontend' &&
npm run dev -- --host 0.0.0.0;
exec bash
"

echo "------------------------------------------------"
echo "✅ APEX ALGO IS LIVE IN SCREEN SESSIONS!"
echo "------------------------------------------------"
echo "👉 View Backend  : screen -r apex_backend"
echo "👉 View Frontend : screen -r apex_frontend"
echo ""
echo "Backend URL : https://localhost:8000"
echo "Frontend URL: https://localhost:5173"
echo ""
echo "💡 TIP: How to work with screen sessions?"
echo " - Detach from a screen (keep it running): Press CTRL + A, release, then press D"
echo " - Stop the process                      : Enter the screen and press CTRL + C"
echo "------------------------------------------------"