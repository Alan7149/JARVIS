$env:PYTHONPATH = ""
$env:PYTHONHOME = ""

Set-Location "$PSScriptRoot\backend"

$restarts = 0
while ($true) {
    foreach ($p in @(8000)) {
        $existing = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if ($existing) {
            Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    }
    if ($restarts -gt 0) { Start-Sleep -Seconds 5 }
    $restarts++

    & "$PSScriptRoot\backend\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content "$PSScriptRoot\backend\logs\restart.log" "$timestamp - Restart #$restarts" -ErrorAction SilentlyContinue
}
