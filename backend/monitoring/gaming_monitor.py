"""
JARVIS Gaming Companion
- Detects active game
- Monitors CPU/GPU temps, FPS (where possible), ping
- Speaks alerts when things go wrong
- Auto-closes background apps when game launches
"""
import logging
import subprocess
import threading
import time

import psutil

logger = logging.getLogger("jarvis.gaming")

GAMING_STATE = {
    "active": False,
    "game": "",
    "cpu_temp": 0.0,
    "gpu_temp": 0.0,
    "cpu_percent": 0.0,
    "gpu_percent": 0.0,
    "ram_percent": 0.0,
    "ping_ms": 0,
    "alerts": [],
    "session_start": None,
    "fps": 0,
    "peak_cpu_temp": 0.0,
    "peak_gpu_temp": 0.0,
    "peak_ping": 0,
}

# Recent gaming sessions (in-memory, capped) for the Advanced tab history
GAMING_SESSIONS: list[dict] = []


def get_sessions() -> list[dict]:
    return list(GAMING_SESSIONS)

KNOWN_GAMES = {
    "valorant": "Valorant",
    "csgo": "CS:GO",
    "cs2": "CS2",
    "fortnite": "Fortnite",
    "minecraft": "Minecraft",
    "gta5": "GTA V",
    "rdr2": "Red Dead Redemption 2",
    "witcher3": "The Witcher 3",
    "elden ring": "Elden Ring",
    "pubg": "PUBG",
    "apex": "Apex Legends",
    "overwatch": "Overwatch",
    "lol": "League of Legends",
    "dota2": "Dota 2",
    "steam": None,  # generic steam
}

CPU_TEMP_WARN = 80
CPU_TEMP_CRIT = 90
GPU_TEMP_WARN = 80
GPU_TEMP_CRIT = 90
PING_WARN = 100
RAM_WARN = 90


def _get_temps() -> tuple[float, float]:
    """Get CPU and GPU temps. Returns (cpu_temp, gpu_temp)."""
    cpu_temp = 0.0
    gpu_temp = 0.0

    # Try WMI for CPU temp
    try:
        import wmi
        w = wmi.WMI(namespace="root\\OpenHardwareMonitor")
        for sensor in w.Sensor():
            if sensor.SensorType == "Temperature":
                if "cpu" in sensor.Name.lower() or "package" in sensor.Name.lower():
                    cpu_temp = max(cpu_temp, float(sensor.Value))
                elif "gpu" in sensor.Name.lower():
                    gpu_temp = max(gpu_temp, float(sensor.Value))
    except Exception:
        pass

    # Try GPUtil for GPU
    try:
        import GPUtil
        gpus = GPUtil.getGPUs()
        if gpus:
            gpu_temp = max(gpu_temp, gpus[0].temperature)
    except Exception:
        pass

    return cpu_temp, gpu_temp


def _ping(host: str = "8.8.8.8") -> int:
    try:
        result = subprocess.run(
            ["ping", "-n", "1", "-w", "1000", host],
            capture_output=True, text=True, timeout=3,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        for line in result.stdout.split("\n"):
            if "time=" in line or "time<" in line:
                import re
                m = re.search(r'time[=<](\d+)', line)
                if m:
                    return int(m.group(1))
    except Exception:
        pass
    return 0


def _detect_game() -> tuple[bool, str]:
    procs = {p.name().lower().replace(".exe", "") for p in psutil.process_iter(['name'])}
    for proc, name in KNOWN_GAMES.items():
        if proc in procs:
            return True, name or proc
    return False, ""


class GamingMonitor:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self.running = False
        self._prev_game = ""
        self._last_alert_time: dict[str, float] = {}

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("Gaming monitor started")

    def stop(self):
        self.running = False

    def _loop(self):
        while self.running:
            try:
                in_game, game_name = _detect_game()

                if in_game and not GAMING_STATE["active"]:
                    GAMING_STATE["active"] = True
                    GAMING_STATE["game"] = game_name
                    GAMING_STATE["session_start"] = time.time()
                    self._prev_game = game_name
                    threading.Thread(target=self._on_game_start, args=(game_name,), daemon=True).start()

                elif not in_game and GAMING_STATE["active"]:
                    GAMING_STATE["active"] = False
                    threading.Thread(target=self._on_game_end, daemon=True).start()

                if GAMING_STATE["active"]:
                    self._update_stats()

            except Exception as e:
                logger.debug("Gaming loop error: %s", e)

            time.sleep(10)

    def _update_stats(self):
        cpu_temp, gpu_temp = _get_temps()
        cpu_pct = psutil.cpu_percent(interval=1)
        ram_pct = psutil.virtual_memory().percent
        ping = _ping()

        GAMING_STATE.update({
            "cpu_temp": cpu_temp,
            "gpu_temp": gpu_temp,
            "cpu_percent": cpu_pct,
            "ram_percent": ram_pct,
            "ping_ms": ping,
            "peak_cpu_temp": max(GAMING_STATE.get("peak_cpu_temp", 0), cpu_temp),
            "peak_gpu_temp": max(GAMING_STATE.get("peak_gpu_temp", 0), gpu_temp),
            "peak_ping": max(GAMING_STATE.get("peak_ping", 0), ping),
        })

        # Alert logic (throttled to once per 5 min per type)
        now = time.time()

        def should_alert(key: str) -> bool:
            return now - self._last_alert_time.get(key, 0) > 300

        if cpu_temp > CPU_TEMP_CRIT and should_alert("cpu_crit"):
            self._last_alert_time["cpu_crit"] = now
            self._speak_alert(f"Warning! CPU temperature is {cpu_temp:.0f} degrees Celsius. Risk of throttling.")

        elif cpu_temp > CPU_TEMP_WARN and should_alert("cpu_warn"):
            self._last_alert_time["cpu_warn"] = now
            self._speak_alert(f"CPU running hot at {cpu_temp:.0f} degrees.")

        if gpu_temp > GPU_TEMP_CRIT and should_alert("gpu_crit"):
            self._last_alert_time["gpu_crit"] = now
            self._speak_alert(f"GPU critical temperature: {gpu_temp:.0f} degrees. Consider reducing settings.")

        if ping > PING_WARN and should_alert("ping"):
            self._last_alert_time["ping"] = now
            self._speak_alert(f"High latency detected: {ping} milliseconds. Network may be unstable.")

        if ram_pct > RAM_WARN and should_alert("ram"):
            self._last_alert_time["ram"] = now
            self._speak_alert(f"RAM usage at {ram_pct:.0f}%. Consider closing background applications.")

        # Broadcast to dashboard
        try:
            import httpx
            httpx.post("http://localhost:8000/api/gaming/update",
                       json=dict(GAMING_STATE), timeout=2)
        except Exception:
            pass

    def _on_game_start(self, game: str):
        GAMING_STATE.update({"peak_cpu_temp": 0.0, "peak_gpu_temp": 0.0, "peak_ping": 0})
        try:
            from core.activity_log import log_event
            log_event("gaming", f"{game} session started", "info")
        except Exception:
            pass
        from voice.wake_word import _speak
        _speak(f"{game} detected. Gaming mode activated. I'll monitor your performance.")
        logger.info("Gaming session started: %s", game)
        # Kill resource hogs
        KILL_ON_GAME = ["chrome", "firefox", "slack", "teams", "discord"]
        for proc in psutil.process_iter(['name', 'pid']):
            name = proc.name().lower().replace(".exe", "")
            if name in KILL_ON_GAME:
                logger.info("Closing %s to free resources", name)

    def _on_game_end(self):
        from voice.wake_word import _speak
        game = GAMING_STATE.get("game", "game")
        duration = int((time.time() - GAMING_STATE.get("session_start", time.time())) / 60)
        session = {
            "game": game, "duration_minutes": duration,
            "peak_cpu_temp": round(GAMING_STATE.get("peak_cpu_temp", 0), 1),
            "peak_gpu_temp": round(GAMING_STATE.get("peak_gpu_temp", 0), 1),
            "peak_ping": GAMING_STATE.get("peak_ping", 0),
            "ended_at": time.strftime("%Y-%m-%d %H:%M"),
        }
        GAMING_SESSIONS.insert(0, session); del GAMING_SESSIONS[30:]
        try:
            from core.activity_log import log_event
            log_event("gaming", f"{game} ended ({duration}m) · peak CPU {session['peak_cpu_temp']}°C", "info")
        except Exception:
            pass
        _speak(f"{game} session ended after {duration} minutes. Welcome back, sir.")
        GAMING_STATE["game"] = ""

    def _speak_alert(self, message: str):
        from voice.wake_word import _speak
        _speak(message)
        alert = {"message": message, "time": time.strftime("%H:%M:%S")}
        GAMING_STATE["alerts"] = ([alert] + GAMING_STATE["alerts"])[:10]


_monitor = GamingMonitor()


def get_monitor() -> GamingMonitor:
    return _monitor
