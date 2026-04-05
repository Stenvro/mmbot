#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

########################################
# Detect current mode
########################################

DOCKER_RUNNING=0
SCREEN_RUNNING=0

if docker compose ps --status running 2>/dev/null | grep -q "apexalgo"; then
    DOCKER_RUNNING=1
fi

if screen -list 2>/dev/null | grep -qE "apex_backend|apex_frontend"; then
    SCREEN_RUNNING=1
fi

########################################
# WAL checkpoint helper (uses Python — no sqlite3 binary needed)
########################################

wal_checkpoint() {
    local DB_FILE="$ROOT_DIR/data/ApexAlgoDB.sqlite3"
    if [ ! -f "$DB_FILE" ]; then
        return 0
    fi

    local PYTHON_BIN=""
    if [ -x "$ROOT_DIR/apexalgo_venv/bin/python" ]; then
        PYTHON_BIN="$ROOT_DIR/apexalgo_venv/bin/python"
    elif command -v python3 >/dev/null 2>&1; then
        PYTHON_BIN="python3"
    else
        echo "WARNING: No Python found — skipping WAL checkpoint."
        return 0
    fi

    echo "Checkpointing database WAL..."
    "$PYTHON_BIN" -c "
import sqlite3, sys
try:
    conn = sqlite3.connect('$DB_FILE')
    result = conn.execute('PRAGMA wal_checkpoint(TRUNCATE);').fetchone()
    conn.close()
    if result[0] == 0:
        print('  [ok] WAL checkpoint complete')
    else:
        print('  WARNING: checkpoint returned', result, file=sys.stderr)
except Exception as e:
    print(f'  WARNING: checkpoint failed: {e}', file=sys.stderr)
"
}

########################################
# Cleanup Docker artifacts from data/
########################################

cleanup_docker_artifacts() {
    # Remove broken Docker symlink (cert -> /app/data/cert)
    if [ -L "data/cert/cert" ]; then
        rm -f data/cert/cert
        echo "  [ok] removed broken Docker symlink data/cert/cert"
    fi

    # Remove Docker frontend build cache hash
    if [ -f "data/.frontend-env-hash" ]; then
        rm -f data/.frontend-env-hash
        echo "  [ok] removed data/.frontend-env-hash"
    fi

    # Fix cert ownership if owned by root
    for f in data/cert/cert.pem data/cert/key.pem; do
        if [ -f "$f" ] && [ "$(stat -c '%U' "$f" 2>/dev/null)" = "root" ]; then
            if sudo -n chown "$(whoami)" "$f" 2>/dev/null; then
                echo "  [ok] fixed ownership on $f"
            else
                echo "  WARNING: $f is owned by root. Run: sudo chown $(whoami) $f"
            fi
        fi
    done
}

########################################
# Switch logic
########################################

if [ "$DOCKER_RUNNING" -eq 1 ] && [ "$SCREEN_RUNNING" -eq 1 ]; then
    echo "ERROR: Both Docker and screen sessions are running."
    echo "  Stop one manually before switching."
    exit 1
fi

if [ "$DOCKER_RUNNING" -eq 0 ] && [ "$SCREEN_RUNNING" -eq 0 ]; then
    echo "Nothing is running. Which mode do you want to start?"
    echo ""
    echo "  1) screen   — bare-metal screen sessions"
    echo "  2) docker   — Docker containers"
    echo ""
    read -rp "Choice [1/2]: " CHOICE
    case "$CHOICE" in
        1) TARGET="screen" ;;
        2) TARGET="docker" ;;
        *) echo "Invalid choice."; exit 1 ;;
    esac
elif [ "$DOCKER_RUNNING" -eq 1 ]; then
    TARGET="screen"
    echo "Docker is running — switching to screen sessions."
elif [ "$SCREEN_RUNNING" -eq 1 ]; then
    TARGET="docker"
    echo "Screen sessions running — switching to Docker."
fi

echo ""

########################################
# Switch to screen
########################################

if [ "$TARGET" = "screen" ]; then
    if [ "$DOCKER_RUNNING" -eq 1 ]; then
        wal_checkpoint
        echo "Stopping Docker..."
        docker compose down
        echo "  [ok] Docker stopped"
    fi

    echo "Cleaning up Docker artifacts..."
    cleanup_docker_artifacts

    echo ""
    exec bash install/Start_ApexAlgo.sh
fi

########################################
# Switch to Docker
########################################

if [ "$TARGET" = "docker" ]; then
    if [ "$SCREEN_RUNNING" -eq 1 ]; then
        echo "Stopping screen sessions..."
        screen -S apex_backend -X quit 2>/dev/null || true
        screen -S apex_frontend -X quit 2>/dev/null || true
        echo "  [ok] screen sessions stopped"
    fi

    # Remove bare-metal symlinks (Docker creates its own inside the container)
    rm -f "$ROOT_DIR/.env" "$ROOT_DIR/.cert"

    echo "Starting Docker..."
    docker compose up -d
    echo ""

    echo "Waiting for backend health check..."
    for i in $(seq 1 30); do
        if curl -sk https://localhost:8000/health 2>/dev/null | grep -q '"ok"'; then
            echo "  [ok] Backend healthy"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "  WARNING: Backend did not become healthy in 30s. Check: docker compose logs backend"
        fi
        sleep 1
    done

    echo ""
    echo "--------------------------------"
    echo "ApexAlgo is running in Docker."
    echo ""
    echo "  docker compose logs -f backend   — tail backend logs"
    echo "  docker compose restart backend   — restart after code changes"
    echo "--------------------------------"
fi
