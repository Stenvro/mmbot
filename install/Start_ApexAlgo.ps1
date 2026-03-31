#Requires -Version 5.1
<#
.SYNOPSIS
    Starts the ApexAlgo backend and frontend services.
.DESCRIPTION
    Launches the FastAPI backend (uvicorn, HTTPS port 8000) and the
    Vite frontend (port 5173) in separate PowerShell windows.
    Run Setup.ps1 first if you haven't already.
.EXAMPLE
    .\Start_ApexAlgo.ps1
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ROOT = Split-Path -Parent $PSScriptRoot

########################################
# Pre-flight checks
########################################

$Abort = $false

$DataDir = Join-Path $ROOT "data"

if (-not (Test-Path (Join-Path $DataDir ".env"))) {
    Write-Host "ERROR: data\.env not found. Run .\install\Setup.ps1 first."
    $Abort = $true
}

if (-not (Test-Path (Join-Path $ROOT "apexalgo_venv"))) {
    Write-Host "ERROR: Virtual environment not found. Run .\install\Setup.ps1 first."
    $Abort = $true
}

$CertFile = Join-Path $DataDir "cert\cert.pem"
$KeyFile  = Join-Path $DataDir "cert\key.pem"

if (-not (Test-Path $CertFile) -or -not (Test-Path $KeyFile)) {
    Write-Host "ERROR: SSL certificate files not found. Run .\install\Setup.ps1 first."
    $Abort = $true
}

if ($Abort) { exit 1 }

# Ensure symlinks exist for app code compatibility
$RootEnv = Join-Path $ROOT ".env"
$RootCert = Join-Path $ROOT ".cert"
if (-not (Test-Path $RootEnv)) { New-Item -ItemType SymbolicLink -Path $RootEnv -Target (Join-Path $DataDir ".env") -Force | Out-Null }
if (-not (Test-Path $RootCert)) { New-Item -ItemType SymbolicLink -Path $RootCert -Target (Join-Path $DataDir "cert") -Force | Out-Null }

$EnvContent = Get-Content (Join-Path $DataDir ".env") -Raw
if ($EnvContent -match "change_me") {
    Write-Host "WARNING: .env contains placeholder values. Edit .env before starting."
    exit 1
}

########################################
# Start backend
########################################

Write-Host "Starting ApexAlgo..."

$BackendCmd = @"
Set-Location '$ROOT'
& '.\apexalgo_venv\Scripts\Activate.ps1'
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile 'data\cert\key.pem' --ssl-certfile 'data\cert\cert.pem'
Read-Host 'Backend stopped. Press Enter to close.'
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendCmd

########################################
# Start frontend
########################################

$FrontendCmd = @"
Set-Location '$ROOT\frontend'
npm run dev -- --host 0.0.0.0
Read-Host 'Frontend stopped. Press Enter to close.'
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $FrontendCmd

########################################
# Done
########################################

# Read VITE_API_BASE_URL from .env for display
$BackendUrl = "https://localhost:8000"
foreach ($line in (Get-Content (Join-Path $DataDir ".env"))) {
    if ($line -match "^VITE_API_BASE_URL=(.+)$") {
        $BackendUrl = $Matches[1]
        break
    }
}

Write-Host ""
Write-Host "--------------------------------"
Write-Host "ApexAlgo is starting."
Write-Host ""
Write-Host "  Backend  : $BackendUrl"
Write-Host "  Frontend : https://localhost:5173"
Write-Host "  API Docs : $BackendUrl/docs"
Write-Host ""
Write-Host "  Two PowerShell windows have been opened."
Write-Host "  Close a window to stop that service."
Write-Host "--------------------------------"
