# JARVIS First-Time Setup Script
Write-Host "JARVIS Setup" -ForegroundColor Cyan
Write-Host "============" -ForegroundColor DarkGray
Write-Host ""

# Backend
Write-Host "[1/4] Setting up Python backend..." -ForegroundColor Green
Set-Location backend

if (-not (Test-Path ".venv")) {
    python -m venv .venv
}
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  Created backend\.env — please fill in your API keys." -ForegroundColor Yellow
}

Set-Location ..

# Frontend
Write-Host "[2/4] Setting up React frontend..." -ForegroundColor Green
Set-Location frontend
npm install
Set-Location ..

# Database
Write-Host "[3/4] Database setup..." -ForegroundColor Yellow
Write-Host "  Ensure PostgreSQL is running and create the database:" -ForegroundColor White
Write-Host "    psql -U postgres -c ""CREATE USER jarvis WITH PASSWORD 'jarvis';"" " -ForegroundColor DarkGray
Write-Host "    psql -U postgres -c ""CREATE DATABASE jarvis OWNER jarvis;"" " -ForegroundColor DarkGray
Write-Host ""

# Redis
Write-Host "[4/4] Redis check..." -ForegroundColor Yellow
Write-Host "  Ensure Redis is running on localhost:6379" -ForegroundColor White
Write-Host "  Download from: https://github.com/tporadowski/redis/releases" -ForegroundColor DarkGray
Write-Host ""

Write-Host "Setup complete. Edit backend\.env then run: .\start.ps1" -ForegroundColor Cyan
