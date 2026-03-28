#!/usr/bin/env bash

set -euo pipefail

echo "⚡ ApexAlgo Setup"
echo "--------------------------------"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

VENV_DIR="apexalgo_venv"
CERT_DIR=".cert"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

########################################
# Helpers
########################################

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

apt_install_if_missing() {
    local pkg="$1"
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
        echo "Installing missing package: $pkg"
        sudo apt-get update
        sudo apt-get install -y "$pkg"
    else
        echo "✔ $pkg already installed"
    fi
}

########################################
# Python 3.11 detection / install
########################################

PYTHON_BIN=""

if command_exists python3.11; then
    PYTHON_BIN="python3.11"
elif command_exists python3; then
    PY_MAJOR="$(python3 -c 'import sys; print(sys.version_info.major)')"
    PY_MINOR="$(python3 -c 'import sys; print(sys.version_info.minor)')"
    if [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 11 ]; then
        PYTHON_BIN="python3"
    fi
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "Python 3.11 not found. Installing..."
    apt_install_if_missing software-properties-common
    sudo add-apt-repository -y ppa:deadsnakes/ppa || true
    sudo apt-get update
    sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
    PYTHON_BIN="python3.11"
fi

PY_VERSION="$($PYTHON_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')"
echo "✅ Using Python: $PYTHON_BIN ($PY_VERSION)"

########################################
# Node.js check
########################################

if ! command_exists node; then
    echo "❌ Node.js is not installed."
    exit 1
fi

NODE_VERSION="$(node -v)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"

if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Found $NODE_VERSION"
    exit 1
fi

echo "✅ Node version OK ($NODE_VERSION)"

########################################
# Required system tools
########################################

if ! command_exists screen; then
    apt_install_if_missing screen
else
    echo "✔ screen already installed"
fi

if ! command_exists openssl; then
    apt_install_if_missing openssl
else
    echo "✔ openssl already installed"
fi

########################################
# Python virtual environment
########################################

echo ""
echo "🐍 Python Environment"

RECREATE_VENV=0

if [ -d "$VENV_DIR" ]; then
    if [ -x "$VENV_DIR/bin/python" ]; then
        VENV_PY_VERSION="$("$VENV_DIR/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
        echo "Detected existing venv Python: $VENV_PY_VERSION"

        if [ "$VENV_PY_VERSION" != "3.11" ]; then
            echo "⚠ Existing venv uses Python $VENV_PY_VERSION, but ApexAlgo requires Python 3.11."
            echo "Recreating venv with Python 3.11..."
            RECREATE_VENV=1
        fi
    else
        echo "⚠ Existing venv is invalid. Recreating..."
        RECREATE_VENV=1
    fi
else
    echo "No venv found. Creating one..."
    RECREATE_VENV=1
fi

if [ "$RECREATE_VENV" -eq 1 ]; then
    rm -rf "$VENV_DIR"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
    echo "✅ Created fresh venv: $VENV_DIR"
else
    echo "✔ existing venv is compatible"
fi

source "$VENV_DIR/bin/activate"

python --version
pip install --upgrade pip setuptools wheel

########################################
# Backend dependencies
########################################

echo ""
echo "📦 Backend dependencies"

if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt not found in project root."
    exit 1
fi

pip install -r requirements.txt

########################################
# Frontend dependencies
########################################

echo ""
echo "⚛️ Frontend Setup"

if [ ! -d "frontend" ]; then
    echo "❌ frontend directory not found."
    exit 1
fi

cd frontend

if [ -f "package-lock.json" ]; then
    npm install
else
    npm install
fi

cd "$ROOT_DIR"

########################################
# SSL certificate generation
########################################

echo ""
echo "🔐 SSL Setup"

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "Generating self-signed development certificate..."
    openssl req -x509 -newkey rsa:4096 -sha256 -nodes \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -days 365 \
        -subj "/CN=localhost"
    echo "✅ SSL certificate created at $CERT_FILE"
else
    echo "✔ SSL certificate already exists"
fi

########################################
# .env preservation
########################################

echo ""
echo "⚙️ Environment file"

if [ -f ".env" ]; then
    echo "✔ .env already exists - leaving it untouched"
else
    cat > .env <<EOF
MASTER_API_KEY=change_me
DATABASE_URL=sqlite:///./data/apexalgo.db
ENCRYPTION_KEY=change_me
VITE_API_BASE_URL=https://localhost:8000
EOF
    echo "✅ .env created"
    echo "⚠ Please edit .env and set your real values"
fi

########################################
# Data directory
########################################

mkdir -p data

########################################
# Firewall info
########################################

echo ""
echo "🌐 Ports"
echo "Backend : 8000"
echo "Frontend: 5173"

echo ""
echo "--------------------------------"
echo "✅ ApexAlgo setup complete"
echo "--------------------------------"
echo ""
echo "Next step:"
echo "./start_apex.sh"