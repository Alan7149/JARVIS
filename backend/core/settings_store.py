"""
JARVIS user-preferences store.
JSON-backed, persists across restarts. Separate from core.config (which holds
secrets/env). This holds the user-tunable knobs the Settings tab controls.
"""
import json
import logging
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.settings")

_STORE_PATH = Path(__file__).parent.parent / "user_settings.json"
_lock = threading.Lock()

# ── Defaults ─────────────────────────────────────────────────────────
DEFAULTS: dict[str, Any] = {
    # Voice & wake word
    "wake_word_enabled": True,
    "wake_words": ["jarvis", "hey jarvis", "okay jarvis"],
    "mic_sensitivity": 250,            # energy threshold
    "tts_voice": "en-GB-RyanNeural",
    "tts_rate": 0,                     # -50..+50 (%)
    "tts_pitch": 0,                    # -50..+50 (Hz)
    "jarvis_muted": False,

    # Proactivity & DND
    "proactivity_level": "balanced",   # off | minimal | balanced | chatty
    "eye_reminders_enabled": True,
    "eye_reminder_min_mins": 55,
    "eye_reminder_max_mins": 90,
    "break_interval_mins": 120,
    "work_mode_auto_dnd": True,
    "auto_mute_meetings": False,       # requires explicit opt-in — mute system audio when a meeting app is detected
    "quiet_hours_enabled": False,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00",
    "cpu_alert_threshold": 90,
    "ram_alert_threshold": 90,
    "disk_alert_threshold": 90,

    # AI
    "ai_model": "llama-3.3-70b-versatile",
    "response_style": "balanced",      # concise | balanced | detailed | stark
    "temperature": 0.7,

    # Monitors (master switches)
    "monitors": {
        "context": True, "clipboard": True, "network": True, "gaming": True,
        "meeting": True, "terminal": True, "predictive": True, "ghost": True,
    },

    # Integrations
    "obsidian_vault_path": "",
    "ntfy_push_topic": "jarvis-push",

    # Appearance
    "accent_color": "#00d4ff",
    "animation_intensity": "full",     # full | reduced | off
    "glitch_effects": True,
    "boot_screen": True,
    "dynamic_color_temp": False,
    "ui_density": "comfortable",       # comfortable | compact
    "ui_sound_effects": True,
    "text_size": "default",            # compact | default | large | xl — global UI text scale

    # Startup
    "launch_on_login": True,
    "start_minimized": False,

    # GitLab integration (token stored locally; never leaves this machine)
    "gitlab_host": "https://gitlab.com",
    "gitlab_token": "",
}

_cache: dict[str, Any] | None = None


def _load() -> dict[str, Any]:
    global _cache
    if _cache is not None:
        return _cache
    data = dict(DEFAULTS)
    try:
        if _STORE_PATH.exists():
            saved = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
            # merge (so new default keys appear for old stores)
            for k, v in saved.items():
                if k in data and isinstance(data[k], dict) and isinstance(v, dict):
                    data[k].update(v)
                else:
                    data[k] = v
    except Exception as e:
        logger.warning("Failed to load settings: %s", e)
    _cache = data
    return data


def get_all() -> dict[str, Any]:
    return dict(_load())


def get(key: str, default: Any = None) -> Any:
    return _load().get(key, default)


def get_tts_params() -> dict[str, str]:
    """Resolve the user's current TTS voice/rate/pitch into edge-tts format.

    Single source of truth so every speaking path (agent replies, wake-word,
    proactive announcements) honours the voice the user picked in Settings
    instead of a hard-coded default. Rate/pitch are stored as signed ints
    (-50..+50) and converted to edge-tts' "+0%"/"-5Hz" string form here.
    """
    data = _load()
    voice = data.get("tts_voice") or "en-GB-RyanNeural"
    try:
        rate_n = int(data.get("tts_rate", 0))
    except (TypeError, ValueError):
        rate_n = 0
    try:
        pitch_n = int(data.get("tts_pitch", 0))
    except (TypeError, ValueError):
        pitch_n = 0
    # Gender hint for the Windows SAPI fallback (used only if edge-tts fails).
    # SAPI can't use the neural voice, but it can at least match the gender.
    _FEMALE_VOICES = {"sonia", "jenny", "aria", "michelle", "ana", "libby", "maisie"}
    gender = "Female" if any(f in voice.lower() for f in _FEMALE_VOICES) else "Male"
    return {
        "voice": voice,
        "rate": f"+{rate_n}%" if rate_n >= 0 else f"{rate_n}%",
        "pitch": f"+{pitch_n}Hz" if pitch_n >= 0 else f"{pitch_n}Hz",
        "gender": gender,
    }


def patch(updates: dict[str, Any]) -> dict[str, Any]:
    """Merge updates into the store and persist."""
    with _lock:
        data = _load()
        for k, v in updates.items():
            if k in data and isinstance(data[k], dict) and isinstance(v, dict):
                data[k].update(v)
            else:
                data[k] = v
        try:
            _STORE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error("Failed to save settings: %s", e)
        return dict(data)


def reset() -> dict[str, Any]:
    global _cache
    with _lock:
        _cache = dict(DEFAULTS)
        try:
            _STORE_PATH.write_text(json.dumps(_cache, indent=2), encoding="utf-8")
        except Exception:
            pass
        return dict(_cache)
