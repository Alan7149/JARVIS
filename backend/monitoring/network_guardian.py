"""
JARVIS Network Guardian
- Monitors all outgoing connections
- Flags unknown/suspicious processes
- Shows live bandwidth usage
- Alerts on data exfiltration patterns
"""
import logging
import socket
import threading
import time
from collections import defaultdict
from datetime import datetime

import psutil

logger = logging.getLogger("jarvis.network")

NETWORK_STATE = {
    "connections": [],
    "bandwidth": {"sent_mbps": 0.0, "recv_mbps": 0.0},
    "top_talkers": [],
    "alerts": [],
    "total_sent_gb": 0.0,
    "total_recv_gb": 0.0,
}

# Known safe processes — whitelist
TRUSTED_PROCS = {
    "chrome", "firefox", "edge", "code", "cursor", "python", "node",
    "git", "svchost", "system", "lsass", "explorer", "teams", "zoom",
    "spotify", "discord", "steam", "onedrive", "outlook", "nvim",
    "tailscale", "tailscaled", "msedge", "brave", "opera",
    "searchindexer", "antimalware", "windowsdefender", "wininit",
    "services", "dwm", "csrss", "smss", "wlms", "spoolsv",
}

# IPs that are always suspicious
SUSPICIOUS_PORTS = {22, 23, 3389, 4444, 5900, 6666, 1234, 31337}


def _resolve_ip(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip


def _get_process_name(pid: int) -> str:
    try:
        return psutil.Process(pid).name().replace(".exe", "").lower()
    except Exception:
        return "unknown"


class NetworkGuardian:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self.running = False
        self._prev_io = psutil.net_io_counters()
        self._prev_time = time.time()

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("Network guardian started")

    def stop(self):
        self.running = False

    def _loop(self):
        while self.running:
            try:
                self._update_bandwidth()
                self._update_connections()
            except Exception as e:
                logger.debug("Network loop error: %s", e)
            time.sleep(5)

    def _update_bandwidth(self):
        now = time.time()
        curr = psutil.net_io_counters()
        elapsed = now - self._prev_time
        if elapsed > 0:
            sent = (curr.bytes_sent - self._prev_io.bytes_sent) / elapsed / 1024 / 1024
            recv = (curr.bytes_recv - self._prev_io.bytes_recv) / elapsed / 1024 / 1024
            NETWORK_STATE["bandwidth"] = {
                "sent_mbps": round(max(0, sent), 3),
                "recv_mbps": round(max(0, recv), 3),
            }
            NETWORK_STATE["total_sent_gb"] = round(curr.bytes_sent / 1024**3, 3)
            NETWORK_STATE["total_recv_gb"] = round(curr.bytes_recv / 1024**3, 3)
        self._prev_io = curr
        self._prev_time = now

    def _update_connections(self):
        conns = []
        proc_traffic = defaultdict(int)
        alerts = []

        for conn in psutil.net_connections(kind="inet"):
            if conn.status not in ("ESTABLISHED", "LISTEN"):
                continue
            if not conn.raddr:
                continue

            remote_ip = conn.raddr.ip
            remote_port = conn.raddr.port
            proc = _get_process_name(conn.pid) if conn.pid else "unknown"

            # Skip loopback
            if remote_ip.startswith("127.") or remote_ip == "::1":
                continue

            is_trusted = proc in TRUSTED_PROCS
            is_suspicious = (
                remote_port in SUSPICIOUS_PORTS or
                (not is_trusted and conn.pid and conn.pid > 0 and proc not in TRUSTED_PROCS)
            )

            entry = {
                "pid": conn.pid,
                "process": proc,
                "local_port": conn.laddr.port if conn.laddr else 0,
                "remote_ip": remote_ip,
                "remote_port": remote_port,
                "status": conn.status,
                "trusted": is_trusted,
                "suspicious": is_suspicious and not is_trusted,
                "time": datetime.now().strftime("%H:%M:%S"),
            }
            conns.append(entry)
            proc_traffic[proc] += 1

            # Alert on suspicious connection
            if is_suspicious and not is_trusted and remote_port in SUSPICIOUS_PORTS:
                alert = {
                    "type": "suspicious_port",
                    "message": f"{proc} connected to {remote_ip}:{remote_port}",
                    "severity": "warning",
                    "time": datetime.now().isoformat(),
                }
                alerts.append(alert)
                if alert not in NETWORK_STATE["alerts"][-10:]:
                    logger.warning("Suspicious connection: %s → %s:%d", proc, remote_ip, remote_port)
                    threading.Thread(target=self._alert, args=(alert,), daemon=True).start()

        # Top talkers
        top = sorted(proc_traffic.items(), key=lambda x: x[1], reverse=True)[:5]
        NETWORK_STATE["top_talkers"] = [{"process": p, "connections": c} for p, c in top]
        NETWORK_STATE["connections"] = conns[:50]
        if alerts:
            NETWORK_STATE["alerts"] = (alerts + NETWORK_STATE["alerts"])[:20]

    def _alert(self, alert: dict):
        from core.websocket_manager import ws_manager
        import asyncio
        try:
            asyncio.run(ws_manager.broadcast("network_alert", alert))
        except Exception:
            pass

    def get_state(self) -> dict:
        return dict(NETWORK_STATE)


_guardian = NetworkGuardian()


def get_guardian() -> NetworkGuardian:
    return _guardian
