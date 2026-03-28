#!/bin/bash

echo "🚀 Starting APEX ALGO in Screen sessions..."

# 1. Start the Backend in its own screen named 'apex_backend'
echo "-> Starting Backend in screen 'apex_backend'..."
screen -dmS apex_backend bash -c "source apexalgo_venv/bin/activate && uvicorn backend.main:app --host 0.0.0.0 --port 8000; exec bash"

# 2. Start the Frontend in its own screen named 'apex_frontend'
echo "-> Starting Frontend in screen 'apex_frontend'..."
screen -dmS apex_frontend bash -c "cd frontend && npm run dev -- --host 0.0.0.0; exec bash"

echo "------------------------------------------------"
echo "✅ APEX ALGO IS NOW RUNNING IN SCREEN SESSIONS!"
echo "------------------------------------------------"
echo "👉 View the Backend : screen -r apex_backend"
echo "👉 View the Frontend: screen -r apex_frontend"
echo ""
echo "💡 TIP: How to work with these screens?"
echo " - Detach from a screen (leave it running): Press CTRL + A, release, then press D"
echo " - Stop the process                    : Enter the screen and press CTRL + C"
echo "------------------------------------------------"