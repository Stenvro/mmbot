#Requires -Version 5.1
<#
.SYNOPSIS
    ApexAlgo setup script for Windows.
.DESCRIPTION
    Installs all dependencies (Python 3.11+, Node.js 18+, mkcert),
    creates the Python virtual environment, installs packages,
    generates SSL certificates, and creates the .env file.
    Run once before starting ApexAlgo for the first time.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Setup.ps1
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ROOT = $PSScriptRoot

Write-Host "ApexAlgo Setup"
Write-Host "--------------------------------"

########################################
# Helper functions
########################################

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Command-Exists([string]$Name) {
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-PythonVersion([string]$Bin) {
    try {
        $ver = & $Bin -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        return $ver.Trim()
    } catch {
        return $null
    }
}

function Version-AtLeast([string]$Version, [int]$Major, [int]$Minor) {
    if (-not $Version) { return $false }
    $parts = $Version -split "\."
    $maj = [int]$parts[0]
    $min = [int]$parts[1]
    return ($maj -gt $Major) -or ($maj -eq $Major -and $min -ge $Minor)
}

########################################
# Python 3.11+
########################################

Write-Host ""
Write-Host "Python 3.11+"

$PythonBin = $null

foreach ($bin in @("python", "python3", "py")) {
    if (Command-Exists $bin) {
        $ver = Get-PythonVersion $bin
        if ($ver -and (Version-AtLeast $ver 3 11)) {
            $PythonBin = $bin
            Write-Host "  [ok] Python $ver ($bin)"
            break
        }
    }
}

if (-not $PythonBin) {
    Write-Host "  Python 3.11+ not found. Installing via winget..."
    winget install --id Python.Python.3.11 --source winget --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    foreach ($bin in @("python", "python3", "py")) {
        if (Command-Exists $bin) {
            $ver = Get-PythonVersion $bin
            if ($ver -and (Version-AtLeast $ver 3 11)) {
                $PythonBin = $bin
                Write-Host "  [ok] Python $ver ($bin)"
                break
            }
        }
    }
    if (-not $PythonBin) {
        Write-Error "ERROR: Python 3.11+ installation failed. Install manually: https://www.python.org/downloads/"
    }
}

########################################
# Node.js 18+
########################################

Write-Host ""
Write-Host "Node.js 18+"

$NodeOk = $false
if (Command-Exists "node") {
    $nodeVer = (node -p "process.versions.node.split('.')[0]" 2>$null).Trim()
    if ([int]$nodeVer -ge 18) {
        $NodeOk = $true
        Write-Host "  [ok] Node.js $(node -v)"
    } else {
        Write-Host "  Node.js $(node -v) is too old. Installing LTS..."
    }
}

if (-not $NodeOk) {
    winget install --id OpenJS.NodeJS.LTS --source winget --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    Write-Host "  [ok] Node.js $(node -v)"
}

########################################
# mkcert
########################################

Write-Host ""
Write-Host "mkcert"

if (-not (Command-Exists "mkcert")) {
    Write-Host "  Installing mkcert via winget..."
    winget install --id FiloSottile.mkcert --source winget --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
}

if (Command-Exists "mkcert") {
    mkcert -install 2>$null
    Write-Host "  [ok] mkcert"
} else {
    Write-Host "  WARNING: mkcert not found after install. Will use self-signed certificate fallback."
}

########################################
# Python virtual environment
########################################

Write-Host ""
Write-Host "Python environment"

$VenvDir = Join-Path $ROOT "apexalgo_venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$RecreateVenv = $false

if (Test-Path $VenvDir) {
    if (Test-Path $VenvPython) {
        $venvVer = Get-PythonVersion $VenvPython
        if ($venvVer -and (Version-AtLeast $venvVer 3 11)) {
            Write-Host "  [ok] venv (Python $venvVer)"
        } else {
            Write-Host "  Existing venv uses Python < 3.11 — recreating..."
            $RecreateVenv = $true
        }
    } else {
        Write-Host "  Existing venv is invalid — recreating..."
        $RecreateVenv = $true
    }
} else {
    $RecreateVenv = $true
}

if ($RecreateVenv) {
    if (Test-Path $VenvDir) { Remove-Item $VenvDir -Recurse -Force }
    & $PythonBin -m venv $VenvDir
    Write-Host "  [ok] venv created"
}

$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"
& $VenvPip install --upgrade pip setuptools wheel -q

########################################
# Backend dependencies
########################################

Write-Host ""
Write-Host "Backend dependencies"

$ReqFile = Join-Path $ROOT "requirements.txt"
if (-not (Test-Path $ReqFile)) {
    Write-Error "ERROR: requirements.txt not found."
}

& $VenvPip install -r $ReqFile -q
Write-Host "  [ok] requirements installed"

########################################
# Frontend dependencies
########################################

Write-Host ""
Write-Host "Frontend dependencies"

$FrontendDir = Join-Path $ROOT "frontend"
if (-not (Test-Path $FrontendDir)) {
    Write-Error "ERROR: frontend/ directory not found."
}

Push-Location $FrontendDir
npm install --silent
Pop-Location
Write-Host "  [ok] npm packages installed"

########################################
# SSL certificates
########################################

Write-Host ""
Write-Host "SSL certificates"

$CertDir = Join-Path $ROOT ".cert"
$CertFile = Join-Path $CertDir "cert.pem"
$KeyFile = Join-Path $CertDir "key.pem"

if (-not (Test-Path $CertDir)) { New-Item -ItemType Directory -Path $CertDir | Out-Null }

if (-not (Test-Path $CertFile) -or -not (Test-Path $KeyFile)) {
    # Collect hostnames including LAN IPs
    $Hosts = @("localhost", "127.0.0.1", "::1")
    try {
        $lanIPs = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                   Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } |
                   Select-Object -ExpandProperty IPAddress)
        foreach ($ip in $lanIPs) { $Hosts += $ip }
    } catch {}

    if (Command-Exists "mkcert") {
        $mkcertArgs = @("-key-file", $KeyFile, "-cert-file", $CertFile) + $Hosts
        & mkcert @mkcertArgs 2>$null
        Write-Host "  [ok] mkcert certificate generated"
    } elseif (Command-Exists "openssl") {
        & openssl req -x509 -newkey rsa:4096 -sha256 -nodes `
            -keyout $KeyFile -out $CertFile `
            -days 365 -subj "/CN=localhost" 2>$null
        Write-Host "  [ok] OpenSSL certificate generated (self-signed fallback)"
    } else {
        Write-Error "ERROR: Neither mkcert nor openssl is available. Cannot generate SSL certificates."
    }
} else {
    Write-Host "  [ok] certificates already present"
}

########################################
# Environment file
########################################

Write-Host ""
Write-Host "Environment"

$EnvFile = Join-Path $ROOT ".env"

if (Test-Path $EnvFile) {
    Write-Host "  [ok] .env already exists — leaving untouched"
} else {
    $ApiKey = & $VenvPython -c "import secrets; print(secrets.token_urlsafe(32))"
    $EncKey = & $VenvPython -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

    $PrimaryIP = $null
    try {
        $PrimaryIP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                      Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } |
                      Select-Object -First 1 -ExpandProperty IPAddress)
    } catch {}
    if (-not $PrimaryIP) { $PrimaryIP = "localhost" }

    $ApiBaseUrl = "https://${PrimaryIP}:8000"

    @"
MASTER_API_KEY=$ApiKey
DATABASE_URL=sqlite:///./data/apexalgo.db
ENCRYPTION_KEY=$EncKey
VITE_API_BASE_URL=$ApiBaseUrl
VITE_API_KEY=$ApiKey
"@ | Set-Content -Path $EnvFile -Encoding UTF8

    Write-Host "  [ok] .env created with auto-generated keys"
    Write-Host "  NOTE: VITE_API_BASE_URL set to $ApiBaseUrl"
    Write-Host "        Update this in .env if accessing from a different host."
}

########################################
# Final setup
########################################

$DataDir = Join-Path $ROOT "data"
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }

########################################
# Done
########################################

Write-Host ""
Write-Host "--------------------------------"
Write-Host "Setup complete."
Write-Host ""
Write-Host "Next step:  .\Start_ApexAlgo.ps1"
Write-Host ""
Write-Host "To regenerate SSL certificates:"
Write-Host "  Delete .cert\cert.pem and .cert\key.pem, then re-run .\Setup.ps1"
Write-Host "--------------------------------"
