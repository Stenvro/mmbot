#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VENV_DIR="apexalgo_venv"
CERT_DIR=".cert"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

echo "ApexAlgo Setup"
echo "--------------------------------"

########################################
# Detect distro and package manager
########################################

PKG_MANAGER=""
DISTRO_ID=""
DISTRO_FAMILY=""

if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO_ID="${ID:-unknown}"
    DISTRO_FAMILY="${ID_LIKE:-$DISTRO_ID}"
fi

case "$DISTRO_ID" in
    ubuntu|linuxmint|pop)            PKG_MANAGER="apt" ;;
    debian|raspbian|kali)            PKG_MANAGER="apt" ;;
    arch|manjaro|endeavouros|garuda) PKG_MANAGER="pacman" ;;
    *)
        case "$DISTRO_FAMILY" in
            *ubuntu*|*debian*) PKG_MANAGER="apt" ;;
            *arch*)            PKG_MANAGER="pacman" ;;
            *)
                echo "WARNING: Unknown distribution '${DISTRO_ID}'. Attempting apt."
                PKG_MANAGER="apt"
                ;;
        esac
        ;;
esac

echo "  [ok] ${DISTRO_ID} (${PKG_MANAGER})"

########################################
# Package manager helpers
########################################

command_exists() { command -v "$1" >/dev/null 2>&1; }

pkg_update() {
    case "$PKG_MANAGER" in
        apt)    sudo apt-get update -qq ;;
        pacman) sudo pacman -Sy --noconfirm >/dev/null 2>&1 ;;
    esac
}

pkg_install() {
    case "$PKG_MANAGER" in
        apt)    sudo apt-get install -y -q "$@" ;;
        pacman) sudo pacman -S --noconfirm --needed "$@" >/dev/null 2>&1 ;;
    esac
}

pkg_available() {
    case "$PKG_MANAGER" in
        apt)    apt-cache show "$1" >/dev/null 2>&1 ;;
        pacman) pacman -Si "$1" >/dev/null 2>&1 ;;
    esac
}

########################################
# Python 3.11+
########################################

echo ""
echo "Python 3.11+"

PYTHON_BIN=""

# Accept any Python >= 3.11
for bin in python3.13 python3.12 python3.11 python3; do
    if command_exists "$bin"; then
        PY_MINOR="$("$bin" -c 'import sys; print(sys.version_info.minor)' 2>/dev/null || echo 0)"
        PY_MAJOR="$("$bin" -c 'import sys; print(sys.version_info.major)' 2>/dev/null || echo 0)"
        if [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 11 ]; then
            PYTHON_BIN="$bin"
            break
        fi
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo "  Python 3.11+ not found. Installing..."
    pkg_update
    case "$PKG_MANAGER" in
        pacman)
            pkg_install python
            PYTHON_BIN="python3"
            ;;
        apt)
            if pkg_available python3.11; then
                pkg_install python3.11 python3.11-venv python3.11-dev
                PYTHON_BIN="python3.11"
            elif [[ "$DISTRO_FAMILY" == *ubuntu* ]] || [[ "$DISTRO_ID" == "ubuntu" ]]; then
                pkg_install software-properties-common
                sudo add-apt-repository -y ppa:deadsnakes/ppa
                pkg_update
                pkg_install python3.11 python3.11-venv python3.11-dev
                PYTHON_BIN="python3.11"
            else
                echo ""
                echo "ERROR: Python 3.11 is not available in your distribution's repos."
                echo "Please upgrade to Debian 12 (Bookworm) / Raspberry Pi OS Bookworm,"
                echo "or install Python 3.11 manually: https://www.python.org/downloads/"
                exit 1
            fi
            ;;
    esac
fi

PY_VERSION="$($PYTHON_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')"
echo "  [ok] Python $PY_VERSION ($PYTHON_BIN)"

########################################
# Node.js 18+
########################################

echo ""
echo "Node.js 18+"

NODE_OK=0
if command_exists node; then
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$NODE_MAJOR" -ge 18 ]; then
        NODE_OK=1
    else
        echo "  Node.js $(node -v) is too old. Installing Node.js 20..."
    fi
fi

if [ "$NODE_OK" -eq 0 ]; then
    case "$PKG_MANAGER" in
        pacman)
            pkg_install nodejs npm
            ;;
        apt)
            pkg_update
            if ! command_exists curl; then pkg_install curl; fi
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
            pkg_install nodejs
            ;;
    esac
fi

echo "  [ok] Node.js $(node -v)"

########################################
# System tools
########################################

echo ""
echo "System tools"

case "$PKG_MANAGER" in
    apt)
        TOOLS_NEEDED=()
        for t in screen openssl curl; do
            command_exists "$t" || TOOLS_NEEDED+=("$t")
        done
        [ "${#TOOLS_NEEDED[@]}" -gt 0 ] && pkg_install "${TOOLS_NEEDED[@]}"
        ;;
    pacman)
        TOOLS_NEEDED=()
        for t in screen openssl curl; do
            command_exists "$t" || TOOLS_NEEDED+=("$t")
        done
        [ "${#TOOLS_NEEDED[@]}" -gt 0 ] && pkg_install "${TOOLS_NEEDED[@]}"
        ;;
esac
echo "  [ok] screen, openssl, curl"

########################################
# mkcert
########################################

echo ""
echo "mkcert"

if ! command_exists mkcert; then
    MKCERT_INSTALLED=0

    case "$PKG_MANAGER" in
        pacman)
            pkg_install mkcert nss 2>/dev/null && MKCERT_INSTALLED=1 || true
            ;;
        apt)
            if pkg_available mkcert 2>/dev/null; then
                pkg_install libnss3-tools mkcert && MKCERT_INSTALLED=1 || true
            else
                pkg_install libnss3-tools -q 2>/dev/null || true
            fi
            ;;
    esac

    # Binary fallback — works on all architectures and distros
    if [ "$MKCERT_INSTALLED" -eq 0 ] && ! command_exists mkcert; then
        MKCERT_ARCH=""
        case "$(uname -m)" in
            x86_64)  MKCERT_ARCH="linux-amd64" ;;
            aarch64) MKCERT_ARCH="linux-arm64" ;;
            armv7l)  MKCERT_ARCH="linux-arm" ;;
            *)
                echo "  WARNING: No mkcert binary for $(uname -m). Will use OpenSSL for certificates."
                ;;
        esac

        if [ -n "$MKCERT_ARCH" ]; then
            echo "  Downloading mkcert binary ($MKCERT_ARCH)..."
            sudo curl -sSL \
                "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-${MKCERT_ARCH}" \
                -o /usr/local/bin/mkcert
            sudo chmod +x /usr/local/bin/mkcert
            echo "  [ok] mkcert (binary)"
        fi
    else
        [ "$MKCERT_INSTALLED" -eq 1 ] && echo "  [ok] mkcert"
    fi
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
        VENV_MINOR="$("$VENV_DIR/bin/python" -c 'import sys; print(sys.version_info.minor)')"
        VENV_MAJOR="$("$VENV_DIR/bin/python" -c 'import sys; print(sys.version_info.major)')"
        if [ "$VENV_MAJOR" -lt 3 ] || [ "$VENV_MINOR" -lt 11 ]; then
            echo "  Existing venv uses Python < 3.11 — recreating..."
            RECREATE_VENV=1
        else
            VENV_VER="$("$VENV_DIR/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
            echo "  [ok] venv (Python $VENV_VER)"
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

[ ! -f "requirements.txt" ] && { echo "ERROR: requirements.txt not found."; exit 1; }

pip install -r requirements.txt -q
echo "  [ok] requirements installed"

########################################
# Frontend dependencies
########################################

echo ""
echo "Frontend dependencies"

[ ! -d "frontend" ] && { echo "ERROR: frontend/ directory not found."; exit 1; }

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
            [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] && HOSTS+=("$ip")
        done
    fi

    if command_exists mkcert; then
        mkcert -key-file "$KEY_FILE" -cert-file "$CERT_FILE" "${HOSTS[@]}" 2>/dev/null
        echo "  [ok] mkcert certificate generated"
    else
        openssl req -x509 -newkey rsa:4096 -sha256 -nodes \
            -keyout "$KEY_FILE" -out "$CERT_FILE" \
            -days 365 -subj "/CN=localhost" 2>/dev/null
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
    GENERATED_API_KEY=$("$PYTHON_BIN" -c "import secrets; print(secrets.token_urlsafe(32))")
    GENERATED_ENC_KEY=$("$VENV_DIR/bin/python" -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
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
    echo "  NOTE: VITE_API_BASE_URL set to ${API_BASE_URL}"
    echo "        Update this in .env if accessing from a different host."
fi

mkdir -p data
chmod +x install/Start_ApexAlgo.sh

########################################
# Done
########################################

echo ""
echo "--------------------------------"
echo "Setup complete."
echo ""
echo "Next step:  bash install/Start_ApexAlgo.sh"
echo ""
echo "To regenerate SSL certificates:"
echo "  Delete .cert/cert.pem and .cert/key.pem, then re-run bash install/Setup.sh"
echo "--------------------------------"
