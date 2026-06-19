# JARVIS WhatsApp Bridge Launcher
# Runs in a visible window so the QR code displays properly

Write-Host ""
Write-Host "  JARVIS WhatsApp Bridge" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  [1] QR code will appear in this window" -ForegroundColor Yellow
Write-Host "  [2] Scan with iPhone: WhatsApp > Settings > Linked Devices > Link a Device" -ForegroundColor Yellow
Write-Host "  [3] OR open browser: http://localhost:8000/api/whatsapp/qr-page" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

Set-Location "$PSScriptRoot\whatsapp-service"

# Set console font to support QR blocks
$host.UI.RawUI.WindowTitle = "JARVIS WhatsApp — Scan QR Code"

node index.js
