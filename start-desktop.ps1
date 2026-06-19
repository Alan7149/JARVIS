# JARVIS Desktop App Launcher
#   By default this REBUILDS the frontend every launch so the latest UI changes
#   always show. Pass -NoBuild to skip the rebuild for a faster start when you
#   have not changed any frontend code.
param(
    [switch]$NoBuild
)

Write-Host ""
Write-Host "  JARVIS Desktop" -ForegroundColor Cyan
Write-Host "  ---------------------------------" -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path "backend\.env")) {
    Write-Host "  [!] backend\.env not found. Run .\setup.ps1 first." -ForegroundColor Yellow
    exit 1
}

# Always rebuild unless explicitly skipped, OR if no build exists yet.
if ((-not $NoBuild) -or (-not (Test-Path "frontend\dist"))) {
    Write-Host "  [1/2] Building React frontend (latest changes)..." -ForegroundColor Green
    Set-Location frontend
    npm run build
    Set-Location ..
} else {
    Write-Host "  [1/2] Skipping frontend build (-NoBuild) - using existing frontend\dist." -ForegroundColor DarkGray
}

Write-Host "  [2/2] Launching JARVIS Desktop App..." -ForegroundColor Green
Set-Location electron
npm start
