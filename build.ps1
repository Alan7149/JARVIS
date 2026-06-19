# JARVIS Full Build Script
# Builds React frontend + Electron installer (.exe)

param(
  [switch]$SkipIcons,
  [switch]$DevMode
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host ""
Write-Host "  JARVIS Build Pipeline" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# Step 1: Generate icons
if (-not $SkipIcons) {
  Write-Host "  [1/4] Generating icons..." -ForegroundColor Green
  $backendPython = Join-Path $Root "backend\.venv\Scripts\python.exe"
  if (Test-Path $backendPython) {
    & $backendPython (Join-Path $Root "scripts\generate_icons.py")
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  [!] Icon generation failed — using SVG fallback" -ForegroundColor Yellow
    }
  } else {
    Write-Host "  [!] Backend venv not found — skipping icon generation. Run .\setup.ps1 first." -ForegroundColor Yellow
    Write-Host "      Icons will use SVG fallback." -ForegroundColor DarkGray
  }
} else {
  Write-Host "  [1/4] Skipping icons (-SkipIcons)" -ForegroundColor DarkGray
}

# Step 2: Build React frontend
Write-Host "  [2/4] Building React frontend..." -ForegroundColor Green
Set-Location (Join-Path $Root "frontend")
npm install
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "  [!] Frontend build failed." -ForegroundColor Red
  exit 1
}
Write-Host "  Frontend built → frontend/dist/" -ForegroundColor DarkGray

# Step 3: Install Electron dependencies
Write-Host "  [3/4] Installing Electron dependencies..." -ForegroundColor Green
Set-Location (Join-Path $Root "electron")
npm install
if ($LASTEXITCODE -ne 0) {
  Write-Host "  [!] Electron npm install failed." -ForegroundColor Red
  exit 1
}

# Step 4: Build installer or just package
Set-Location (Join-Path $Root "electron")
if ($DevMode) {
  Write-Host "  [4/4] Packaging (dev mode, no installer)..." -ForegroundColor Green
  npm run build:dir
  $exePath = Get-ChildItem "dist\win-unpacked\JARVIS.exe" -ErrorAction SilentlyContinue
  if ($exePath) {
    Write-Host ""
    Write-Host "  ✓ JARVIS packaged at: $($exePath.FullName)" -ForegroundColor Cyan
  }
} else {
  Write-Host "  [4/4] Building Windows installer..." -ForegroundColor Green
  npm run build
  $installer = Get-ChildItem "dist\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($installer) {
    Write-Host ""
    Write-Host "  ✓ Installer ready: $($installer.FullName)" -ForegroundColor Cyan
    Write-Host "  Run it to install JARVIS on this machine." -ForegroundColor White
  }
}

Set-Location $Root
Write-Host ""
Write-Host "  Build complete." -ForegroundColor Green
Write-Host ""
