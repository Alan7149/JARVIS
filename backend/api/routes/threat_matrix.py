"""JARVIS Threat Matrix — Security War Room."""
import asyncio
import hashlib
import logging
import socket
import subprocess
import time
from datetime import datetime
import psutil
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger("jarvis.threat")

# Stale-while-revalidate cache — scanning is expensive (geoip + net_connections)
_tm_cache = {"data": None, "ts": 0}
_TM_TTL = 20        # serve cached scan for up to 20s
_tm_refreshing = False

KNOWN_SAFE = {"chrome","firefox","msedge","brave","code","cursor","python","node","git","explorer",
              "svchost","system","lsass","winlogon","csrss","dwm","taskmgr","teams","slack","discord",
              "spotify","steam","tailscale","nvda","zoom","opera","vivaldi","brave"}

HIGH_RISK_PORTS = {22,23,3389,4444,5900,6666,1234,31337,6660,6697,8333}
MED_RISK_PORTS  = {21,25,110,143,445,1433,3306,5432,27017,6379}

# Known malicious IP ranges (simplified)
TOR_INDICATORS = ["10.x", "192.168.x"]  # simplified

_geo_cache = {}

async def _geoip(ip: str) -> dict:
    if ip in _geo_cache:
        return _geo_cache[ip]
    try:
        import httpx
        r = await httpx.AsyncClient(timeout=4).get(f"http://ip-api.com/json/{ip}?fields=country,countryCode,city,lat,lon,isp,threat")
        data = r.json()
        _geo_cache[ip] = data
        return data
    except Exception:
        return {}


async def _safe_call(coro, fallback):
    try:
        return await asyncio.wait_for(coro, timeout=5.0)
    except Exception:
        return fallback


async def _build_matrix():
    results = await asyncio.gather(
        _safe_call(_scan_connections(), []),
        _safe_call(_scan_processes(), []),
        _safe_call(_check_open_ports(), []),
    )
    connections = results[0] or []
    processes   = results[1] or []
    open_ports  = results[2] or []

    score = _calc_threat_score(connections, processes, open_ports)

    # VPN status (run in executor so subprocess doesn't block loop)
    vpn = {"connected": False}
    try:
        loop = asyncio.get_event_loop()
        def _vpn():
            r = subprocess.run(["C:\\Program Files\\Tailscale\\tailscale.exe", "status"],
                capture_output=True, text=True, timeout=3, creationflags=subprocess.CREATE_NO_WINDOW)
            return {"connected": "alanbabu" in r.stdout or "Connected" in r.stdout, "type": "Tailscale"}
        vpn = await asyncio.wait_for(loop.run_in_executor(None, _vpn), timeout=3.5)
    except Exception:
        pass

    return {
        "timestamp": datetime.now().isoformat(),
        "threat_score": score,
        "connections": connections[:30],
        "suspicious_processes": processes,
        "open_ports": open_ports,
        "vpn": vpn,
        "total_connections": len(connections),
        "alerts": _build_alerts(connections, processes, open_ports, vpn),
    }


async def prewarm():
    """Build threat matrix once at startup so first load is instant."""
    global _tm_cache
    try:
        _tm_cache["data"] = await _build_matrix()
        _tm_cache["ts"] = time.time()
        logger.info("Threat matrix pre-warmed")
    except Exception as e:
        logger.warning("Threat prewarm failed: %s", e)


@router.get("/threat/matrix")
async def threat_matrix():
    """Threat matrix — instant from cache, rescans in background."""
    global _tm_refreshing
    now = time.time()
    age = now - _tm_cache["ts"]

    if _tm_cache["data"] and age < _TM_TTL:
        return _tm_cache["data"]

    if _tm_cache["data"] and not _tm_refreshing:
        async def _bg():
            global _tm_refreshing
            _tm_refreshing = True
            try:
                _tm_cache["data"] = await _build_matrix()
                _tm_cache["ts"] = time.time()
            finally:
                _tm_refreshing = False
        asyncio.create_task(_bg())
        return _tm_cache["data"]

    _tm_cache["data"] = await _build_matrix()
    _tm_cache["ts"] = now
    return _tm_cache["data"]


async def _scan_connections():
    conns = []
    geoip_tasks = []
    raw_conns = []

    # Run psutil in thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    try:
        net_conns = await asyncio.wait_for(loop.run_in_executor(None, lambda: psutil.net_connections(kind="inet")), timeout=4)
    except Exception:
        return []

    for c in net_conns:
        if c.status not in ("ESTABLISHED","LISTEN") or not c.raddr:
            continue
        ip = c.raddr.ip
        if ip.startswith(("127.","::1","0.","169.")):
            continue
        proc = "unknown"
        try:
            if c.pid:
                proc = psutil.Process(c.pid).name().replace(".exe","").lower()
        except Exception:
            pass
        raw_conns.append({"ip": ip, "port": c.raddr.port, "process": proc,
                          "local_port": c.laddr.port if c.laddr else 0,
                          "status": c.status, "pid": c.pid})
        geoip_tasks.append(_geoip(ip))

    # Only geolocate first 5 to stay fast
    geo_limit = 5
    safe_tasks = [asyncio.wait_for(t, timeout=2.5) for t in geoip_tasks[:geo_limit]]
    geos = await asyncio.gather(*safe_tasks, return_exceptions=True)
    for i, rc in enumerate(raw_conns[:20]):
        geo = geos[i] if i < len(geos) and not isinstance(geos[i], Exception) else {}
        is_suspicious = (rc["port"] in HIGH_RISK_PORTS or
                         (rc["process"] not in KNOWN_SAFE and rc["process"] != "unknown"))
        conns.append({**rc, "country": geo.get("country","?"), "country_code": geo.get("countryCode","??"),
                      "city": geo.get("city",""), "lat": geo.get("lat",0), "lon": geo.get("lon",0),
                      "isp": geo.get("isp",""), "suspicious": is_suspicious})
    return conns


async def _scan_processes():
    suspicious = []
    import re
    bad_patterns = [r"keylog",r"spy",r"miner",r"crypt",r"trojan",r"hack",r"rat\b",r"stealer"]
    for p in psutil.process_iter(['pid','name','exe','cpu_percent','connections']):
        try:
            name = p.info['name'].lower().replace('.exe','')
            if any(re.search(pat, name) for pat in bad_patterns):
                suspicious.append({"name": name, "pid": p.info['pid'],
                                    "risk": "HIGH", "reason": "Name matches threat pattern"})
            elif name not in KNOWN_SAFE and (p.info.get('cpu_percent') or 0) > 50:
                suspicious.append({"name": name, "pid": p.info['pid'],
                                    "risk": "MEDIUM", "reason": f"Unknown process at {p.info['cpu_percent']}% CPU"})
        except Exception:
            pass
    return suspicious[:10]


async def _check_open_ports():
    listening = []
    loop = asyncio.get_event_loop()
    try:
        conns = await asyncio.wait_for(loop.run_in_executor(None, lambda: psutil.net_connections(kind="inet")), timeout=4)
    except Exception:
        return []
    for c in conns:
        if c.status == "LISTEN" and c.laddr:
            port = c.laddr.port
            risk = "HIGH" if port in HIGH_RISK_PORTS else "MEDIUM" if port in MED_RISK_PORTS else "LOW"
            proc = "?"
            try:
                if c.pid: proc = psutil.Process(c.pid).name().replace(".exe","")
            except Exception:
                pass
            listening.append({"port": port, "process": proc, "risk": risk})
    return sorted(listening, key=lambda x: {"HIGH":0,"MEDIUM":1,"LOW":2}[x["risk"]])[:15]


def _calc_threat_score(conns, procs, ports) -> int:
    score = 0
    # Suspicious connections
    score += sum(10 for c in conns if c.get("suspicious"))
    score = min(score, 40)
    # High-risk processes
    score += sum(15 for p in procs if p.get("risk") == "HIGH")
    score += sum(5 for p in procs if p.get("risk") == "MEDIUM")
    score = min(score, 70)
    # Open risky ports
    score += sum(8 for p in ports if p.get("risk") == "HIGH")
    score += sum(3 for p in ports if p.get("risk") == "MEDIUM")
    return min(score, 95)


def _build_alerts(conns, procs, ports, vpn) -> list:
    alerts = []
    for c in conns:
        if c.get("suspicious"):
            alerts.append({"type":"connection","severity":"warning",
                "msg":f"{c['process']} → {c['ip']}:{c['port']} ({c.get('country','?')})"})
    for p in procs:
        if p.get("risk") == "HIGH":
            alerts.append({"type":"process","severity":"critical","msg":f"Suspicious: {p['name']} (PID {p['pid']})"})
    if not vpn.get("connected"):
        alerts.append({"type":"vpn","severity":"info","msg":"VPN not active — traffic is unencrypted"})
    return alerts[:10]
