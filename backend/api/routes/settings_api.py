"""JARVIS Settings API — read/update user preferences + system actions."""
import asyncio
import logging
from fastapi import APIRouter
from core import settings_store

router = APIRouter()
logger = logging.getLogger("jarvis.settings_api")


@router.get("/settings")
async def get_settings():
    """Return all user settings + live system status."""
    data = settings_store.get_all()
    # Attach live status for the monitors + integrations
    status = {}
    try:
        from monitoring import proactive_jarvis
        status["dnd_active"] = proactive_jarvis._is_dnd() if hasattr(proactive_jarvis, "_is_dnd") else False
        status["work_mode"] = proactive_jarvis._is_work_mode() if hasattr(proactive_jarvis, "_is_work_mode") else False
    except Exception:
        pass
    try:
        from voice.wake_word import get_listener
        status["wake_word_running"] = bool(getattr(get_listener(), "running", False))
    except Exception:
        status["wake_word_running"] = False
    return {"settings": data, "status": status}


@router.patch("/settings")
async def update_settings(updates: dict):
    """Patch settings and apply side-effects where relevant."""
    data = settings_store.patch(updates)

    # Apply side-effects for keys that control live systems
    try:
        if "wake_word_enabled" in updates:
            from voice.wake_word import start_wake_word, stop_wake_word
            if updates["wake_word_enabled"]:
                start_wake_word()
            else:
                stop_wake_word()
    except Exception as e:
        logger.warning("wake word toggle failed: %s", e)

    # Push proactive timing into the live module
    try:
        from monitoring import proactive_jarvis as pj
        if "eye_reminder_min_mins" in updates:
            pj.EYE_REMINDER_MIN_MINS = int(updates["eye_reminder_min_mins"])
        if "eye_reminder_max_mins" in updates:
            pj.EYE_REMINDER_MAX_MINS = int(updates["eye_reminder_max_mins"])
        if "break_interval_mins" in updates:
            pj.BREAK_INTERVAL_MINS = int(updates["break_interval_mins"])
    except Exception as e:
        logger.warning("proactive timing update failed: %s", e)

    return {"settings": data, "ok": True}


@router.post("/settings/reset")
async def reset_settings():
    return {"settings": settings_store.reset(), "ok": True}


@router.post("/settings/dnd")
async def set_dnd(payload: dict):
    """Activate DND for N minutes (0 = clear)."""
    minutes = int(payload.get("minutes", 60))
    try:
        from monitoring import proactive_jarvis as pj
        if minutes <= 0:
            pj.clear_dnd() if hasattr(pj, "clear_dnd") else pj.set_dnd(0)
            return {"dnd": False}
        pj.set_dnd(minutes)
        return {"dnd": True, "minutes": minutes}
    except Exception as e:
        return {"error": str(e)}


@router.post("/settings/monitor")
async def toggle_monitor(payload: dict):
    """Start/stop a background monitor by name."""
    name = payload.get("name", "")
    enable = bool(payload.get("enable", True))
    settings_store.patch({"monitors": {name: enable}})

    module_map = {
        "context": ("monitoring.context_monitor", "get_monitor"),
        "clipboard": ("monitoring.clipboard_monitor", "get_monitor"),
        "network": ("monitoring.network_guardian", "get_guardian"),
        "gaming": ("monitoring.gaming_monitor", "get_monitor"),
        "meeting": ("monitoring.meeting_assistant", "get_assistant"),
        "terminal": ("monitoring.terminal_assistant", "get_assistant"),
        "predictive": ("monitoring.predictive_engine", "get_engine"),
    }
    try:
        if name == "ghost":
            from monitoring import parallel_ghost
            parallel_ghost.start() if enable else parallel_ghost.stop()
        elif name in module_map:
            mod_name, getter = module_map[name]
            mod = __import__(mod_name, fromlist=[getter])
            obj = getattr(mod, getter)()
            if enable:
                obj.start()
            elif hasattr(obj, "stop"):
                obj.stop()
        return {"monitor": name, "enabled": enable}
    except Exception as e:
        return {"monitor": name, "error": str(e)}


@router.post("/settings/test-voice")
async def test_voice(payload: dict):
    """Speak a test phrase with current voice settings."""
    text = payload.get("text", "All systems nominal, sir. Voice configuration successful.")
    try:
        from agent.tool_registry import _speak
        await _speak(text)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/settings/test-notification")
async def test_notification():
    """Send a test push notification to the phone."""
    try:
        from notifications.notifier import send_notification
        await send_notification(
            title="JARVIS Test",
            message="Push notifications are working, sir.",
            severity="info",
        )
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
