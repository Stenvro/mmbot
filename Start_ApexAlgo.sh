#!/bin/bash
echo "🚀 Starting APEX ALGO in Screen sessions..."

# 1. Start de Backend in een eigen screen genaamd 'apex_backend'
echo "-> Starting Backend in screen 'apex_backend'..."
screen -dmS apex_backend bash -c "source apexalgo_venv/bin/activate && uvicorn backend.main:app --host 0.0.0.0 --port 8000; exec bash"

# 2. Start de Frontend in een eigen screen genaamd 'apex_frontend'
echo "-> Starting Frontend in screen 'apex_frontend'..."
screen -dmS apex_frontend bash -c "cd frontend && npm run dev -- --host 0.0.0.0; exec bash"

echo "------------------------------------------------"
echo "✅ APEX ALGO IS LIVE IN SCREEN SESSIONS!"
echo "------------------------------------------------"
echo "👉 Bekijk de Backend : screen -r apex_backend"
echo "👉 Bekijk de Frontend: screen -r apex_frontend"
echo ""
echo "💡 TIP: Hoe werk je met deze screens?"
echo " - Uit de screen gaan (laten draaien) : Druk op CTRL + A, laat los, en druk dan op D"
echo " - Het proces stoppen (afsluiten)     : Ga de screen in en druk op CTRL + C"
echo "------------------------------------------------"