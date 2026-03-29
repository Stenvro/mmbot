#!/usr/bin/env bash

set -euo pipefail

echo "ApexAlgo Setup"
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
        sudo apt-get update -qq
        sudo apt-get install -y "$pkg"
    else
        echo "  [ok] $pkg"
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
    sudo apt-get update -qq
    sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
    PYTHON_BIN="python3.11"
fi

PY_VERSION="$($PYTHON_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')"
echo "  [ok] Python $PY_VERSION"

########################################
# Node.js check
########################################

if ! command_exists node; then
    echo "ERROR: Node.js is not installed. Install Node.js 18+ and re-run this script."
    exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "ERROR: Node.js 18+ required. Found $(node -v)."
    exit 1
fi

echo "  [ok] Node.js $(node -v)"

########################################
# Required system tools
########################################

for tool in screen openssl; do
    if ! command_exists "$tool"; then
        apt_install_if_missing "$tool"
    else
        echo "  [ok] $tool"
    fi
done

########################################
# mkcert setup
########################################

echo ""
echo "SSL (mkcert)"

if ! command_exists mkcert; then
    apt_install_if_missing libnss3-tools
    apt_install_if_missing mkcert
else
    echo "  [ok] mkcert"
fi

if command_exists mkcert; then
    mkcert -install 2>/dev/null || true
fi

########################################
# Python virtual environment
########################################

echo ""
echo "Python environment"

RECREATE_VENV=0

if [ -d "$VENV_DIR" ]; then
    if [ -x "$VENV_DIR/bin/python" ]; then
        VENV_PY_VERSION="$("$VENV_DIR/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
        if [ "$VENV_PY_VERSION" != "3.11" ]; then
            echo "  Existing venv uses Python $VENV_PY_VERSION — recreating with Python 3.11..."
            RECREATE_VENV=1
        else
            echo "  [ok] venv (Python $VENV_PY_VERSION)"
        fi
    else
        echo "  Existing venv is invalid — recreating..."
        RECREATE_VENV=1
    fi
else
    RECREATE_VENV=1
fi

if [ "$RECREATE_VENV" -eq 1 ]; then
    rm -rf "$VENV_DIR"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
    echo "  [ok] venv created"
fi

source "$VENV_DIR/bin/activate"
pip install --upgrade pip setuptools wheel -q

########################################
# Backend dependencies
########################################

echo ""
echo "Backend dependencies"

if [ ! -f "requirements.txt" ]; then
    echo "ERROR: requirements.txt not found."
    exit 1
fi

pip install -r requirements.txt -q
echo "  [ok] requirements installed"

########################################
# Frontend dependencies
########################################

echo ""
echo "Frontend dependencies"

if [ ! -d "frontend" ]; then
    echo "ERROR: frontend/ directory not found."
    exit 1
fi

cd frontend
npm install --silent
cd "$ROOT_DIR"
echo "  [ok] npm packages installed"

########################################
# SSL certificates
########################################

echo ""
echo "SSL certificates"

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    HOSTS=("localhost" "127.0.0.1" "::1")

    LAN_IPS="$(hostname -I 2>/dev/null || true)"
    if [ -n "$LAN_IPS" ]; then
        for ip in $LAN_IPS; do
            if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
                HOSTS+=("$ip")
            fi
        done
    fi

    if command_exists mkcert; then
        mkcert -key-file "$KEY_FILE" -cert-file "$CERT_FILE" "${HOSTS[@]}" 2>/dev/null
        echo "  [ok] mkcert certificate generated"
    else
        openssl req -x509 -newkey rsa:4096 -sha256 -nodes \
            -keyout "$KEY_FILE" \
            -out "$CERT_FILE" \
            -days 365 \
            -subj "/CN=localhost" 2>/dev/null
        echo "  [ok] OpenSSL certificate generated (self-signed fallback)"
    fi
else
    echo "  [ok] certificates already present"
fi

########################################
# Environment file
########################################

echo ""
echo "Environment"

if [ -f ".env" ]; then
    echo "  [ok] .env already exists — leaving untouched"
else
    # Generate secure keys automatically using the installed venv
    GENERATED_API_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    GENERATED_ENC_KEY=$("$VENV_DIR/bin/python" -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

    # Detect primary LAN IP for VITE_API_BASE_URL
    PRIMARY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    API_BASE_URL="https://${PRIMARY_IP:-localhost}:8000"

    cat > .env <<EOF
MASTER_API_KEY=${GENERATED_API_KEY}
DATABASE_URL=sqlite:///./data/apexalgo.db
ENCRYPTION_KEY=${GENERATED_ENC_KEY}
VITE_API_BASE_URL=${API_BASE_URL}
VITE_API_KEY=${GENERATED_API_KEY}
EOF
    echo "  [ok] .env created with auto-generated keys"
    echo "  NOTE: VITE_API_BASE_URL is set to ${API_BASE_URL}"
    echo "        Update this in .env if your backend runs on a different host."
fi

########################################
# Data directory
########################################

mkdir -p data

########################################
# Make start script executable
########################################

chmod +x Start_ApexAlgo.sh

########################################
# Done
########################################

echo ""
echo "--------------------------------"
echo "Setup complete."
echo ""
echo "Next step:"
echo "  ./Start_ApexAlgo.sh"
echo ""
echo "To regenerate SSL certificates:"
echo "  Delete .cert/cert.pem and .cert/key.pem, then re-run ./Setup.sh"
echo "--------------------------------"
