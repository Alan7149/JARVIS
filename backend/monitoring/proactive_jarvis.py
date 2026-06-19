"""
JARVIS Proactive Monitor
Speaks without being asked — interrupts with critical alerts.
Features: CPU alerts, meeting pre-brief, eye strain, posture, breaks, dynamic volume
"""
import asyncio
import logging
import random
import subprocess
import threading
import time
from datetime import datetime

import psutil

logger = logging.getLogger("jarvis.proactive")

# ── Timing config — easy to tune ───────────────────────────────────────────
# Eye reminder: fires between MIN and MAX minutes, randomly chosen each time
EYE_REMINDER_MIN_MINS = 55     # earliest it can remind (55 min)
EYE_REMINDER_MAX_MINS = 90     # latest it can remind (90 min)

# Break enforcer: only after this many minutes of continuous work
BREAK_INTERVAL_MINS = 120      # 2 hours (was 90 min)

# CPU alert throttle
CPU_ALERT_COOLDOWN_MINS = 10

# Work modes where JARVIS goes silent for non-critical alerts
WORK_MODES = {"coding", "focus", "writing", "designing", "presenting"}

# State
STATE = {
    "focus_shield_active": False,
    "focus_end_time": None,
    "last_eye_reminder": time.time(),          # initialize to now so it waits full interval
    "next_eye_reminder": time.time() + random.uniform(EYE_REMINDER_MIN_MINS, EYE_REMINDER_MAX_MINS) * 60,
    "last_break": time.time(),
    "last_cpu_alert": 0,
    "night_mode": False,
    "music_playing": False,
    "last_meeting_brief": "",
    "stress_level": 0.0,
    "dnd_until": 0,            # do not disturb until this timestamp
}

_running = False
_thread: threading.Thread | None = None


def _speak(text: str, volume_adjust: float = 1.0):
    """Speak proactively — respects night mode and music."""
    from voice.wake_word import _speak as ws
    # Adjust for night mode (softer)
    if STATE["night_mode"]:
        text = text  # TTS handles pitch
    threading.Thread(target=ws, args=(text,), daemon=True).start()


async def _broadcast(event: str, data: dict):
    from core.websocket_manager import ws_manager
    try:
        await ws_manager.broadcast(event, data)
    except Exception:
        pass


def _is_work_mode() -> bool:
    """Check if user is in a work/focus mode where interruptions should be minimized."""
    try:
        from monitoring.context_monitor import get_state
        ctx = get_state()
        return ctx.get("mode", "idle") in WORK_MODES or STATE["focus_shield_active"]
    except Exception:
        return STATE["focus_shield_active"]


def _is_dnd() -> bool:
    """Check if do-not-disturb is active."""
    return time.time() < STATE.get("dnd_until", 0)


def set_dnd(minutes: int):
    """Set do-not-disturb for N minutes."""
    STATE["dnd_until"] = time.time() + minutes * 60
    logger.info("DND active for %d minutes", minutes)


async def check_proactive():
    """Main proactive check — runs every 60 seconds."""
    now = time.time()
    hour = datetime.now().hour
    STATE["night_mode"] = hour >= 22 or hour < 7
    in_work_mode = _is_work_mode()
    in_dnd = _is_dnd()

    # If just entered work mode, silently notify once
    if in_work_mode and not STATE.get("_notified_work_mode"):
        STATE["_notified_work_mode"] = True
        await _broadcast("proactive_alert", {
            "type": "work_mode",
            "message": "Work mode detected — non-critical alerts silenced",
            "severity": "info"
        })
        # Reset break timer so we don't immediately nag after entering work mode
        STATE["last_break"] = now
    elif not in_work_mode:
        STATE["_notified_work_mode"] = False

    # ── CPU critical alert (ALWAYS fires — this is critical) ──────────
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        cpu_cooldown = CPU_ALERT_COOLDOWN_MINS * 60
        if cpu > 90 and now - STATE["last_cpu_alert"] > cpu_cooldown:
            STATE["last_cpu_alert"] = now
            # CPU is always critical, speak even in work mode
            _speak(f"Warning, sir. CPU at {cpu:.0f} percent. Possible performance impact.")
            await _broadcast("proactive_alert", {"type": "cpu", "message": f"CPU critical: {cpu:.0f}%", "severity": "critical"})
    except Exception:
        pass

    # ── Below here: all non-critical — skip in work/focus/DND mode ───
    if in_work_mode or in_dnd or STATE["night_mode"] or STATE["focus_shield_active"]:
        return

    # ── Eye strain reminder — randomized interval, occasional ─────────
    if now >= STATE["next_eye_reminder"]:
        STATE["last_eye_reminder"] = now
        # Schedule next reminder randomly between MIN and MAX minutes from now
        next_interval = random.uniform(EYE_REMINDER_MIN_MINS, EYE_REMINDER_MAX_MINS) * 60
        STATE["next_eye_reminder"] = now + next_interval
        # Only remind 60% of the time (occasional, not always)
        if random.random() < 0.6:
            _speak("Sir, a gentle reminder to rest your eyes for a moment.")
            await _broadcast("proactive_alert", {
                "type": "eye_strain",
                "message": f"Eye break reminder (next in ~{int(next_interval/60)} min)",
                "severity": "info"
            })

    # ── Break enforcer — only after extended unbroken work ────────────
    break_interval = BREAK_INTERVAL_MINS * 60
    if now - STATE["last_break"] > break_interval:
        STATE["last_break"] = now
        # Reset next eye reminder too since they're taking a break
        STATE["next_eye_reminder"] = now + random.uniform(EYE_REMINDER_MIN_MINS, EYE_REMINDER_MAX_MINS) * 60
        try:
            subprocess.run(
                ["powershell", "-Command",
                 "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, 5)"],
                creationflags=subprocess.CREATE_NO_WINDOW, check=False, timeout=5
            )
        except Exception:
            pass
        _speak(f"Sir, you have been working for {BREAK_INTERVAL_MINS} minutes. I recommend a short break. I have dimmed the screen.")
        await _broadcast("proactive_alert", {
            "type": "break",
            "message": f"{BREAK_INTERVAL_MINS}-min break reminder — screen dimmed",
            "severity": "warning"
        })
        async def restore_screen():
            await asyncio.sleep(120)
            try:
                subprocess.run(
                    ["powershell", "-Command",
                     "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, 80)"],
                    creationflags=subprocess.CREATE_NO_WINDOW, check=False, timeout=5
                )
            except Exception:
                pass
        asyncio.create_task(restore_screen())

    # ── Meeting pre-brief (check every minute) ───────────────────────
    try:
        await asyncio.wait_for(_check_upcoming_meeting(), timeout=3.0)
    except Exception:
        pass


async def _check_upcoming_meeting():
    """Alert 10 minutes before any calendar event."""
    from core.config import settings
    if not settings.GOOGLE_CREDENTIALS_FILE:
        return
    try:
        from tools.calendar_tools import CalendarTools
        cal = await CalendarTools.get_calendar_events(days_ahead=1, max_results=10)
        events = cal.get("events", [])
        now = datetime.now()
        for event in events:
            start_str = event.get("start", "")
            if "T" not in start_str:
                continue
            try:
                start = datetime.fromisoformat(start_str.replace("Z", "+00:00")).replace(tzinfo=None)
                mins_until = (start - now).total_seconds() / 60
                key = f"{event['title']}_{start_str}"
                if 9 <= mins_until <= 11 and STATE["last_meeting_brief"] != key:
                    STATE["last_meeting_brief"] = key
                    title = event["title"]
                    _speak(f"Sir, you have {title} in 10 minutes. Shall I brief you on the attendees and agenda?")
            except Exception:
                pass
    except Exception:
        pass


def activate_focus_shield(minutes: int = 120):
    """Block distractions for the specified duration."""
    STATE["focus_shield_active"] = True
    STATE["focus_end_time"] = time.time() + minutes * 60
    STATE["last_break"] = time.time()
    # Also set DND for the same duration
    STATE["dnd_until"] = time.time() + minutes * 60
    # Reset eye reminder timer
    STATE["next_eye_reminder"] = time.time() + minutes * 60 + random.uniform(20, 40) * 60
    _speak(f"Focus shield active for {minutes} minutes. All non-critical alerts silenced. Good luck, sir.")
    def deactivate():
        time.sleep(minutes * 60)
        STATE["focus_shield_active"] = False
        STATE["dnd_until"] = 0
        _speak(f"Focus session complete. {minutes} minutes of uninterrupted work. Well done, sir.")
    threading.Thread(target=deactivate, daemon=True).start()


def deactivate_focus_shield():
    STATE["focus_shield_active"] = False
    _speak("Focus shield deactivated.")


def start():
    global _running, _thread
    if _running:
        return
    _running = True
    _thread = threading.Thread(target=_loop, daemon=True)
    _thread.start()
    logger.info("Proactive JARVIS started")


def _loop():
    while _running:
        try:
            asyncio.run(check_proactive())
        except Exception as e:
            logger.debug("Proactive check error: %s", e)
        time.sleep(60)


def get_state() -> dict:
    now = time.time()
    s = dict(STATE)
    s["next_eye_in_mins"] = max(0, round((STATE.get("next_eye_reminder", 0) - now) / 60, 1))
    s["break_in_mins"] = max(0, round((BREAK_INTERVAL_MINS * 60 - (now - STATE.get("last_break", now))) / 60, 1))
    s["dnd_mins_remaining"] = max(0, round((STATE.get("dnd_until", 0) - now) / 60, 1))
    return s
