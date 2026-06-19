# JARVIS Startup Script — Windows PowerShell
Write-Host ""
Write-Host "  ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗" -ForegroundColor Cyan
Write-Host "  ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝" -ForegroundColor Cyan
Write-Host "  ██║███████║██████╔╝██║   ██║██║███████╗" -ForegroundColor Cyan
Write-Host "  ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║" -ForegroundColor Cyan
Write-Host "  ██║██║  ██║██║  ██║ ╚████╔╝ ██║███████║" -ForegroundColor Cyan
Write-Host "  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Just A Rather Very Intelligent System" -ForegroundColor DarkCyan
Write-Host "  ───────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# Check for .env
if (-not (Test-Path "backend\.env")) {
    Write-Host "  [!] backend\.env not found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "  [!] Please edit backend\.env and set your ANTHROPIC_API_KEY before continuing." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Start backend
Write-Host "  [1/2] Starting JARVIS Core (FastAPI)..." -ForegroundColor Green
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000" -PassThru -WindowStyle Normal

Start-Sleep -Seconds 3

# Start frontend
Write-Host "  [2/2] Starting JARVIS Dashboard (React)..." -ForegroundColor Green
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -PassThru -WindowStyle Normal

Write-Host ""
Write-Host "  JARVIS is initializing..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Dashboard:  http://localhost:5173" -ForegroundColor White
Write-Host "  API:        http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:   http://localhost:8000/docs" -ForegroundColor White
Write-Host "  WebSocket:  ws://localhost:8000/ws" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""
