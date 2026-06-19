"""JARVIS Calendar — local, JSON-backed events with full add/delete.

Stored in data/calendar.json on this machine. Simple and private; no external
calendar account required.
"""
import json
import logging
import threading
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger("jarvis.calendar")

_PATH = Path(__file__).parent.parent / "data" / "calendar.json"
_PATH.parent.mkdir(exist_ok=True)
_lock = threading.Lock()


def _load() -> list[dict]:
    try:
        return json.loads(_PATH.read_text(encoding="utf-8")) if _PATH.exists() else []
    except Exception:
        return []


def _save(events: list[dict]):
    _PATH.write_text(json.dumps(events, indent=2), encoding="utf-8")


@router.get("/calendar/events")
async def list_events(start: str | None = None, end: str | None = None):
    events = _load()
    if start:
        events = [e for e in events if e.get("date", "") >= start]
    if end:
        events = [e for e in events if e.get("date", "") <= end]
    events.sort(key=lambda e: (e.get("date", ""), e.get("time", "")))
    return {"events": events}


@router.post("/calendar/events")
async def add_event(payload: dict):
    title = (payload.get("title") or "").strip()
    date = (payload.get("date") or "").strip()  # YYYY-MM-DD
    if not title or not date:
        return {"error": "title and date are required"}
    event = {
        "id": uuid.uuid4().hex[:10],
        "title": title,
        "date": date,
        "time": (payload.get("time") or "").strip(),
        "notes": (payload.get("notes") or "").strip(),
        "color": payload.get("color") or "#00d4ff",
        "created_at": datetime.now().isoformat(),
    }
    with _lock:
        events = _load(); events.append(event); _save(events)
    return {"event": event}


@router.patch("/calendar/events/{event_id}")
async def update_event(event_id: str, payload: dict):
    with _lock:
        events = _load()
        for e in events:
            if e["id"] == event_id:
                for k in ("title", "date", "time", "notes", "color"):
                    if k in payload:
                        e[k] = payload[k]
                _save(events)
                return {"event": e}
    return {"error": "not found"}


@router.delete("/calendar/events/{event_id}")
async def delete_event(event_id: str):
    with _lock:
        events = _load()
        new = [e for e in events if e["id"] != event_id]
        if len(new) == len(events):
            return {"deleted": False}
        _save(new)
    return {"deleted": True}
