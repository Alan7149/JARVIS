import psutil
from fastapi import APIRouter

from core.config import settings

router = APIRouter()


@router.get("/")
async def health():
    return {
        "status": "online",
        "name": settings.APP_NAME,
        "version": settings.VERSION,
    }


@router.get("/system")
async def system_health():
    """Full system status — used by Dashboard on initial load (no WebSocket needed)."""
    from datetime import datetime, timezone
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk_data = []
    for part in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disk_data.append({
                "mount": part.mountpoint,
                "percent": usage.percent,
                "free_gb": round(usage.free / 1e9, 2),
                "total_gb": round(usage.total / 1e9, 2),
            })
        except Exception:
            continue

    status = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu_percent": cpu,
        "ram_percent": mem.percent,
        "ram_used_gb": round(mem.used / 1e9, 2),
        "ram_total_gb": round(mem.total / 1e9, 2),
        "disks": disk_data,
    }
    try:
        b = psutil.sensors_battery()
        if b:
            status["battery"] = {"percent": b.percent, "plugged": b.power_plugged}
    except Exception:
        pass
    return status
