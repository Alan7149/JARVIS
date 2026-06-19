"""
JARVIS Predictive Intent Engine
Learns your daily patterns and proactively acts before you ask.
Tracks: what apps you open, when you work, what you ask JARVIS.
After 3+ days of data, starts predicting and automating.
"""
import json
import logging
import threading
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("jarvis.predict")

PATTERNS_FILE = Path(__file__).parent.parent / "data" / "patterns.json"
PATTERNS_FILE.parent.mkdir(exist_ok=True)

# Pattern storage
_patterns: dict = {
    "hourly_apps": defaultdict(lambda: defaultdict(int)),   # hour → app → count
    "hourly_commands": defaultdict(list),                    # hour → [commands]
    "daily_routine": {},                                     # detected routines
    "command_history": [],                                   # last 200 commands
}


def load_patterns():
    try:
        if PATTERNS_FILE.exists():
            data = json.loads(PATTERNS_FILE.read_text())
            _patterns["hourly_apps"] = defaultdict(lambda: defaultdict(int), {
                k: defaultdict(int, v) for k, v in data.get("hourly_apps", {}).items()
            })
            _patterns["command_history"] = data.get("command_history", [])
            logger.info("Patterns loaded: %d command history entries", len(_patterns["command_history"]))
    except Exception as e:
        logger.warning("Pattern load failed: %s", e)


def save_patterns():
    try:
        data = {
            "hourly_apps": {k: dict(v) for k, v in _patterns["hourly_apps"].items()},
            "command_history": _patterns["command_history"][-200:],
        }
        PATTERNS_FILE.write_text(json.dumps(data, indent=2))
    except Exception:
        pass


def record_app(app: str):
    """Record that an app was used at this hour."""
    hour = str(datetime.now().hour)
    _patterns["hourly_apps"][hour][app] += 1
    if len(_patterns["command_history"]) % 10 == 0:
        save_patterns()


def record_command(command: str):
    """Record a JARVIS command for pattern learning."""
    entry = {
        "cmd": command[:100],
        "hour": datetime.now().hour,
        "day": datetime.now().weekday(),
        "time": datetime.now().isoformat(),
    }
    _patterns["command_history"].append(entry)
    if len(_patterns["command_history"]) > 200:
        _patterns["command_history"] = _patterns["command_history"][-200:]


def get_predictions(hour: int = None) -> list[dict]:
    """Return predicted actions for the current or given hour."""
    hour = str(hour or datetime.now().hour)
    hour_apps = _patterns["hourly_apps"].get(hour, {})
    if not hour_apps:
        return []
    # Return apps that appear >3 times at this hour
    frequent = [(app, count) for app, count in hour_apps.items() if count >= 3]
    frequent.sort(key=lambda x: -x[1])
    return [{"action": "open_app", "app": app, "confidence": min(count/10, 1.0)}
            for app, count in frequent[:3]]


class PredictiveEngine:
    """Background engine that learns and acts on patterns."""

    def __init__(self):
        self._thread: threading.Thread | None = None
        self.running = False
        self._last_prediction_hour = -1

    def start(self):
        load_patterns()
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("Predictive engine started")

    def stop(self):
        self.running = False

    def _loop(self):
        while self.running:
            try:
                self._observe()
                self._predict()
            except Exception as e:
                logger.debug("Predict loop error: %s", e)
            time.sleep(60)  # check every minute

    def _observe(self):
        """Record current app usage."""
        try:
            import win32gui
            import win32process
            import psutil
            hwnd = win32gui.GetForegroundWindow()
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            app = psutil.Process(pid).name().replace(".exe", "").lower()
            if app not in ("explorer", "searchhost", "searchapp", "dwm"):
                record_app(app)
        except Exception:
            pass

    def _predict(self):
        """Check if there's a prediction for this hour and act on it."""
        hour = datetime.now().hour
        if hour == self._last_prediction_hour:
            return  # already predicted this hour

        predictions = get_predictions(hour)
        if not predictions:
            return

        self._last_prediction_hour = hour
        logger.info("Predictions for hour %d: %s", hour, predictions)

        # Greet with prediction
        top = predictions[0]
        confidence = top["confidence"]
        if confidence >= 0.5 and top["action"] == "open_app":
            from voice.wake_word import _speak
            _speak(f"Good {self._time_greeting()}. Based on your patterns, you usually open {top['app']} around now.")

    def _time_greeting(self) -> str:
        h = datetime.now().hour
        return "morning" if h < 12 else "afternoon" if h < 17 else "evening"


_engine = PredictiveEngine()


def get_engine() -> PredictiveEngine:
    return _engine
