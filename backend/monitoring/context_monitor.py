"""
JARVIS Context / Mood Awareness
Tracks active apps, detects work mode, meeting mode, gaming mode, etc.
Adapts JARVIS behavior and triggers automations.
"""
import logging
import subprocess
import threading
import time
from datetime import datetime

logger = logging.getLogger("jarvis.context")

CONTEXT_STATE = {
    "mode": "idle",            # idle | coding | meeting | gaming | browsing | presenting | focus
    "active_app": "",
    "active_window": "",
    "in_meeting": False,
    "gaming": False,
    "focus_start": None,
    "hours_worked_today": 0.0,
    "last_break_reminder": 0,
    "session_start": time.time(),
}

MEETING_APPS = {"teams", "zoom", "webex", "meet", "discord", "slack", "skype", "whereby", "ms-teams", "msteams"}
CODING_APPS = {
    "code", "cursor", "pycharm", "intellij", "webstorm", "rider", "devenv",
    "sublime_text", "atom", "notepad++", "vim", "nvim", "emacs",
    "clion", "goland", "rubymine", "datagrip", "fleet",
}
GAMING_APPS = {
    "steam", "epicgameslauncher", "origin", "battlenet", "robloxplayerbeta",
    "javaw", "minecraft", "valorant", "csgo", "cs2", "fortnite",
    "gta5", "rdr2", "witcher3", "elden ring", "pubg", "apexlegends",
    "overwatch", "league of legends", "dota2", "r5apex",
}
BROWSER_APPS = {"chrome", "firefox", "msedge", "opera", "brave", "iexplore", "waterfox", "vivaldi"}
WRITING_APPS = {"winword", "word", "notion", "obsidian", "typora", "onenote", "evernote", "writer"}
DESIGN_APPS = {"figma", "photoshop", "illustrator", "gimp", "inkscape", "blender", "xd", "sketch"}

BREAK_REMINDER_INTERVAL = 90 * 60   # remind every 90 min
MIN_FOCUS_MINUTES = 25              # detect "focus mode" after 25min in same app


def _get_active_window() -> tuple[str, str]:
    """Returns (process_name, window_title)."""
    try:
        import win32gui
        import win32process
        import psutil
        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd)
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        proc = psutil.Process(pid)
        return proc.name().lower().replace(".exe", ""), title
    except Exception:
        return "", ""


def _detect_mode(proc_name: str, window_title: str) -> str:
    lower_title = window_title.lower()
    p = proc_name.lower()

    if any(app in p for app in MEETING_APPS) or any(app in lower_title for app in MEETING_APPS):
        return "meeting"
    if any(app in p for app in GAMING_APPS):
        return "gaming"
    if any(app in p for app in CODING_APPS):
        return "coding"
    if any(app in p for app in DESIGN_APPS):
        return "designing"
    if any(app in p for app in WRITING_APPS):
        return "writing"
    if "powerpnt" in p or "keynote" in p or "impress" in p:
        return "presenting"
    if any(app in p for app in BROWSER_APPS):
        if any(x in lower_title for x in ["youtube", "netflix", "twitch", "prime video", "hotstar", "disney"]):
            return "watching"
        if any(x in lower_title for x in ["github", "stackoverflow", "docs.", "devdocs", "mdn"]):
            return "coding"
        return "browsing"
    # Default: try window title for hints
    if any(x in lower_title for x in [".py", ".js", ".ts", ".go", ".rs", ".cpp", ".java", "terminal", "cmd", "powershell"]):
        return "coding"
    return "idle"


def _running_processes() -> set[str]:
    """Get set of running process names (lowercase, no .exe)."""
    import psutil
    try:
        return {p.name().lower().replace(".exe", "") for p in psutil.process_iter(['name'])}
    except Exception:
        return set()


class ContextMonitor:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self.running = False
        self._prev_mode = ""
        self._mode_start = time.time()

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="jarvis-context")
        self._thread.start()
        logger.info("Context monitor started")

    def stop(self):
        self.running = False

    def _loop(self):
        while self.running:
            try:
                proc, title = _get_active_window()
                mode = _detect_mode(proc, title)
                procs = _running_processes()
                in_meeting = bool(MEETING_APPS & procs)
                gaming = bool(GAMING_APPS & procs)

                CONTEXT_STATE["active_app"] = proc
                CONTEXT_STATE["active_window"] = title[:100]
                CONTEXT_STATE["in_meeting"] = in_meeting
                CONTEXT_STATE["gaming"] = gaming

                # Update mode
                if mode != self._prev_mode:
                    self._prev_mode = mode
                    self._mode_start = time.time()
                    CONTEXT_STATE["mode"] = mode
                    self._on_mode_change(mode, proc, title)

                # Focus detection — same app for 25+ min
                if time.time() - self._mode_start > MIN_FOCUS_MINUTES * 60:
                    if mode in ("coding", "writing") and CONTEXT_STATE["mode"] != "focus":
                        CONTEXT_STATE["mode"] = "focus"
                        CONTEXT_STATE["focus_start"] = datetime.now().isoformat()

                # Break reminder
                worked = (time.time() - CONTEXT_STATE["session_start"]) / 3600
                CONTEXT_STATE["hours_worked_today"] = round(worked, 1)
                now = time.time()
                if (now - CONTEXT_STATE["last_break_reminder"] > BREAK_REMINDER_INTERVAL
                        and CONTEXT_STATE["mode"] in ("coding", "focus", "writing")
                        and worked > 1.5):
                    CONTEXT_STATE["last_break_reminder"] = now
                    threading.Thread(target=self._break_reminder, daemon=True).start()

                # Auto-mute/unmute music when meeting starts/ends
                self._handle_meeting_music(in_meeting)

            except Exception as e:
                logger.debug("Context loop error: %s", e)

            time.sleep(5)

    _was_in_meeting = False

    def _handle_meeting_music(self, in_meeting: bool):
        if in_meeting and not self._was_in_meeting:
            self._was_in_meeting = True
            # Auto-mute requires the user's explicit opt-in (Settings > Proactivity & DND)
            from core import settings_store
            if not settings_store.get("auto_mute_meetings", False):
                return
            try:
                subprocess.run(
                    ["powershell", "-Command",
                     "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)"],
                    creationflags=subprocess.CREATE_NO_WINDOW, check=False
                )
            except Exception:
                pass
        elif not in_meeting and self._was_in_meeting:
            self._was_in_meeting = False

    def _on_mode_change(self, mode: str, proc: str, title: str):
        logger.info("Mode changed: %s (app: %s)", mode, proc)
        # Broadcast to WebSocket
        try:
            import httpx
            httpx.post("http://localhost:8000/api/context/event",
                       json={"mode": mode, "app": proc, "window": title},
                       timeout=2)
        except Exception:
            pass

    def _break_reminder(self):
        from voice.wake_word import _speak
        hours = CONTEXT_STATE["hours_worked_today"]
        _speak(f"Sir, you have been working for {hours:.1f} hours. I recommend a short break.")
        logger.info("Break reminder sent")


_monitor = ContextMonitor()


def get_monitor() -> ContextMonitor:
    return _monitor


def get_state() -> dict:
    return dict(CONTEXT_STATE)
