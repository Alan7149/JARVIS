# ============================================================
#  JARVIS Backend Service Fixer
#  RIGHT-CLICK this file → "Run with PowerShell" as ADMINISTRATOR
#  (or run from an elevated PowerShell prompt)
#
#  Fixes the JARVIS-Backend Windows service, which was
#  misconfigured (empty parameters + wrong directory) so it
#  never actually started the backend.
# ============================================================

$ErrorActionPreference = "Stop"

# Must be admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
            ).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "This script needs Administrator rights. Re-launching elevated..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$svc        = "JARVIS-Backend"
$backendDir = Join-Path $PSScriptRoot "backend"
$python     = "$backendDir\.venv\Scripts\python.exe"
$regBase    = "HKLM:\SYSTEM\CurrentControlSet\Services\$svc\Parameters"

Write-Host "Stopping $svc ..." -ForegroundColor Cyan
Stop-Service $svc -Force -ErrorAction SilentlyContinue
Start-Sleep 2

if (Test-Path $regBase) {
    Write-Host "Fixing nssm parameters..." -ForegroundColor Cyan
    Set-ItemProperty $regBase -Name "Application"   -Value $python
    Set-ItemProperty $regBase -Name "AppParameters" -Value "-m uvicorn main:app --host 0.0.0.0 --port 8000"
    Set-ItemProperty $regBase -Name "AppDirectory"  -Value $backendDir
    Set-ItemProperty $regBase -Name "AppEnvironmentExtra" -Type MultiString -Value @("PYTHONPATH=", "PYTHONHOME=")
    Write-Host "  Application   = $python"
    Write-Host "  AppParameters = -m uvicorn main:app --host 0.0.0.0 --port 8000"
    Write-Host "  AppDirectory  = $backendDir"
} else {
    Write-Host "Service registry not found — creating service with nssm..." -ForegroundColor Yellow
    $nssm = Get-Command nssm -ErrorAction SilentlyContinue
    if ($nssm) {
        & nssm install $svc $python "-m uvicorn main:app --host 0.0.0.0 --port 8000"
        & nssm set $svc AppDirectory $backendDir
        & nssm set $svc AppEnvironmentExtra "PYTHONPATH=" "PYTHONHOME="
    } else {
        Write-Host "nssm not found on PATH. Install nssm or rely on the JARVIS.exe auto-start instead." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Setting service to auto-start + auto-restart on failure..." -ForegroundColor Cyan
& sc.exe config $svc start= auto | Out-Null
& sc.exe failure $svc reset= 60 actions= restart/5000/restart/5000/restart/5000 | Out-Null

Write-Host "Starting $svc ..." -ForegroundColor Cyan
Start-Service $svc
Start-Sleep 8

# Verify
try {
    $r = Invoke-WebRequest "http://localhost:8000/api/health/" -UseBasicParsing -TimeoutSec 5
    Write-Host "`n✅ SUCCESS — backend is responding: $($r.Content)" -ForegroundColor Green
    Write-Host "The backend will now start automatically every time Windows boots." -ForegroundColor Green
} catch {
    Write-Host "`n⚠️ Service started but health check failed. Give it ~20s and check http://localhost:8000/api/health/" -ForegroundColor Yellow
}

Write-Host "`nDone. You can close this window."
