import asyncio
import logging
from datetime import datetime, timezone

import psutil

from core.config import settings
from core.websocket_manager import ws_manager

logger = logging.getLogger("jarvis.monitor")


async def run_system_checks():
    try:
        loop = asyncio.get_event_loop()
        cpu = await loop.run_in_executor(None, lambda: psutil.cpu_percent(interval=0.3))
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
                if usage.percent >= settings.DISK_ALERT_THRESHOLD:
                    await _send_disk_alert(part.mountpoint, usage.percent)
            except PermissionError:
                continue

        status = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "cpu_percent": cpu,
            "ram_percent": mem.percent,
            "ram_used_gb": round(mem.used / 1e9, 2),
            "ram_total_gb": round(mem.total / 1e9, 2),
            "disks": disk_data,
        }

        battery = None
        try:
            b = psutil.sensors_battery()
            if b:
                battery = {"percent": b.percent, "plugged": b.power_plugged}
                if b.percent < 20 and not b.power_plugged:
                    await _send_battery_alert(b.percent)
        except Exception:
            pass

        if battery:
            status["battery"] = battery

        await ws_manager.broadcast("system_status", status)
        logger.debug("System check complete: CPU %.1f%% RAM %.1f%%", cpu, mem.percent)

    except Exception as e:
        logger.error("System monitor error: %s", e)


async def _send_disk_alert(mount: str, percent: float):
    from notifications.notifier import send_notification
    await send_notification(
        title="JARVIS: Disk Space Warning",
        message=f"Drive {mount} is {percent:.1f}% full. Take action before it fills up.",
        severity="warning",
    )


async def _send_battery_alert(percent: float):
    from notifications.notifier import send_notification
    await send_notification(
        title="JARVIS: Low Battery",
        message=f"Battery at {percent:.0f}%. Connect your charger.",
        severity="warning",
    )
