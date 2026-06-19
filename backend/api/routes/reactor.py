"""JARVIS Reactor Core — instant system vitals for the live arc-reactor view.

The scheduled system_status broadcast only fires every few minutes, far too
slow for a 'breathing' animation. This endpoint is cheap enough to poll once a
second: CPU, RAM, disk, network throughput (computed as a delta between calls)
and GPU (via nvidia-smi when present).
"""
import logging
import os
import subprocess
import time

import psutil
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger("jarvis.reactor")

_CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
_last = {"net": None, "disk": None, "ts": 0.0}


def _gpu() -> dict | None:
    """GPU utilization via nvidia-smi. Returns None if no NVIDIA GPU / tool."""
    try:
        r = subprocess.run(
            ["nvidia-smi",
             "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2,
            creationflags=_CREATE_NO_WINDOW,
        )
        line = r.stdout.strip().splitlines()[0]
        util, mem_used, mem_total, temp = [x.strip() for x in line.split(",")]
        return {
            "percent": float(util),
            "mem_used_mb": float(mem_used),
            "mem_total_mb": float(mem_total),
            "mem_percent": round(float(mem_used) / max(float(mem_total), 1) * 100, 1),
            "temp_c": float(temp),
        }
    except Exception:
        return None


@router.get("/reactor/vitals")
async def vitals():
    now = time.time()
    per_core = psutil.cpu_percent(interval=0.12, percpu=True)
    cpu = round(sum(per_core) / len(per_core), 1) if per_core else 0.0
    mem = psutil.virtual_memory()

    # Primary disk (system drive on Windows, root elsewhere)
    try:
        disk = psutil.disk_usage("C:\\" if os.name == "nt" else "/")
        disk_percent = disk.percent
    except Exception:
        disk_percent = 0.0

    # Network + disk I/O rates (delta since last poll)
    net = psutil.net_io_counters()
    try:
        dio = psutil.disk_io_counters()
    except Exception:
        dio = None

    net_up_kbps = net_down_kbps = 0.0
    disk_io_kbps = 0.0
    if _last["net"] is not None and _last["ts"]:
        dt = max(now - _last["ts"], 0.001)
        net_up_kbps = max(0.0, (net.bytes_sent - _last["net"].bytes_sent) / dt / 1024)
        net_down_kbps = max(0.0, (net.bytes_recv - _last["net"].bytes_recv) / dt / 1024)
        if dio and _last["disk"]:
            disk_io_kbps = max(0.0, ((dio.read_bytes + dio.write_bytes)
                                     - (_last["disk"].read_bytes + _last["disk"].write_bytes)) / dt / 1024)
    _last["net"] = net
    _last["disk"] = dio
    _last["ts"] = now

    # Map throughput to a 0..100 "load" feel (10 MB/s saturates the gauge)
    net_total_kbps = net_up_kbps + net_down_kbps
    net_load = min(100.0, net_total_kbps / 10240 * 100)
    disk_load = min(100.0, disk_io_kbps / 10240 * 100)

    battery = None
    try:
        b = psutil.sensors_battery()
        if b:
            battery = {"percent": round(b.percent, 0), "plugged": b.power_plugged}
    except Exception:
        pass

    return {
        "cpu": round(cpu, 1),
        "per_core": [round(c, 1) for c in per_core],
        "ram": round(mem.percent, 1),
        "ram_used_gb": round(mem.used / 1e9, 1),
        "ram_total_gb": round(mem.total / 1e9, 1),
        "disk": round(disk_percent, 1),
        "disk_io_kbps": round(disk_io_kbps, 1),
        "disk_load": round(disk_load, 1),
        "net_up_kbps": round(net_up_kbps, 1),
        "net_down_kbps": round(net_down_kbps, 1),
        "net_load": round(net_load, 1),
        "gpu": _gpu(),
        "battery": battery,
        "cores": psutil.cpu_count(logical=True),
    }
