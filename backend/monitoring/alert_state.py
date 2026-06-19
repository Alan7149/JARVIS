"""Persistent per-alert runtime state — dedup + snooze.

Kept in a small JSON file (not the DB) so it survives backend restarts without
needing a schema migration. Tracks, per alert id:
  triggered      — is the condition currently failing
  down_since     — when it started failing (for "still down for Xh")
  last_notified  — when we last pushed a notification (for the hourly reminder)
  snoozed_until  — ISO timestamp; while in the future, notifications are muted
"""
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("jarvis.alert_state")

_PATH = Path(__file__).parent.parent / "alert_state.json"
_lock = threading.Lock()
_cache: dict | None = None

_DEFAULT = {"triggered": False, "down_since": None, "last_notified": None, "snoozed_until": None}


def _load() -> dict:
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(_PATH.read_text(encoding="utf-8")) if _PATH.exists() else {}
        except Exception:
            _cache = {}
    return _cache


def _save():
    try:
        _PATH.write_text(json.dumps(_cache, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning("Failed to save alert state: %s", e)


def get_state(alert_id: int) -> dict:
    return {**_DEFAULT, **(_load().get(str(alert_id)) or {})}


def set_state(alert_id: int, st: dict):
    with _lock:
        _load()[str(alert_id)] = st
        _save()


def is_snoozed(alert_id: int, now: datetime | None = None) -> bool:
    su = get_state(alert_id).get("snoozed_until")
    if not su:
        return False
    now = now or datetime.now(timezone.utc)
    try:
        return now < datetime.fromisoformat(su)
    except Exception:
        return False


def snooze(alert_id: int, hours: float):
    from datetime import timedelta
    until = datetime.now(timezone.utc) + timedelta(hours=hours)
    st = get_state(alert_id)
    st["snoozed_until"] = until.isoformat()
    set_state(alert_id, st)
    return st["snoozed_until"]


def unsnooze(alert_id: int):
    st = get_state(alert_id)
    st["snoozed_until"] = None
    set_state(alert_id, st)
