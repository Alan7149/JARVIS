"""Lightweight, capped activity log for the Advanced tab's detections feed.

Monitors call log_event(...) when something notable happens (meeting started,
game ended, network alert, etc.). Stored in a small JSON file so it survives
restarts. Not the audit log (that's security/tool actions) — this is the
human-facing "what have my monitors noticed" stream.
"""
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("jarvis.activity")

_PATH = Path(__file__).parent.parent / "data" / "activity_log.json"
_PATH.parent.mkdir(exist_ok=True)
_lock = threading.Lock()
_MAX = 200


def log_event(kind: str, message: str, severity: str = "info"):
    """Record a monitor detection. kind e.g. 'meeting' | 'gaming' | 'network' | 'focus'."""
    try:
        with _lock:
            events = _read()
            events.insert(0, {
                "kind": kind, "message": message, "severity": severity,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            del events[_MAX:]
            _PATH.write_text(json.dumps(events), encoding="utf-8")
    except Exception as e:
        logger.debug("activity log failed: %s", e)


def _read() -> list[dict]:
    try:
        return json.loads(_PATH.read_text(encoding="utf-8")) if _PATH.exists() else []
    except Exception:
        return []


def get_events(limit: int = 50) -> list[dict]:
    return _read()[:limit]
