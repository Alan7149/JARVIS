"""Unified API routes for all 8 advanced features."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

# ── Face Recognition ─────────────────────────────────────────────────────────

@router.get("/face/status")
async def face_status():
    from monitoring.face_recognition_monitor import get_state
    return get_state()

@router.post("/face/train")
async def face_train(seconds: int = 5):
    from monitoring.face_recognition_monitor import get_monitor
    import asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, get_monitor().train, seconds)
    return result

@router.post("/face/start")
async def face_start():
    from monitoring.face_recognition_monitor import get_monitor
    get_monitor().start()
    return {"started": True}

@router.post("/face/stop")
async def face_stop():
    from monitoring.face_recognition_monitor import get_monitor
    get_monitor().stop()
    return {"stopped": True}

@router.post("/face/event")
async def face_event(payload: dict):
    from core.websocket_manager import ws_manager
    await ws_manager.broadcast("face_event", payload)
    return {"ok": True}

# ── Context Awareness ────────────────────────────────────────────────────────

@router.get("/context/status")
async def context_status():
    from monitoring.context_monitor import get_state
    return get_state()

@router.post("/context/start")
async def context_start():
    from monitoring.context_monitor import get_monitor
    get_monitor().start()
    return {"started": True}

@router.post("/context/event")
async def context_event(payload: dict):
    from core.websocket_manager import ws_manager
    await ws_manager.broadcast("context_change", payload)
    return {"ok": True}

# ── Meeting Assistant ────────────────────────────────────────────────────────

@router.get("/meeting/status")
async def meeting_status():
    from monitoring.meeting_assistant import get_assistant
    return get_assistant().get_state()

@router.post("/meeting/start")
async def meeting_start():
    from monitoring.meeting_assistant import get_assistant
    get_assistant().start()
    return {"started": True}

@router.post("/meeting/event")
async def meeting_event(payload: dict):
    from core.websocket_manager import ws_manager
    await ws_manager.broadcast("meeting_event", payload)
    return {"ok": True}

@router.post("/meeting/transcript")
async def meeting_transcript(payload: dict):
    from core.websocket_manager import ws_manager
    await ws_manager.broadcast("meeting_transcript", payload)
    return {"ok": True}

@router.get("/meeting/history")
async def meeting_history(limit: int = 20):
    from monitoring.meeting_assistant import get_history
    return {"meetings": get_history(limit)}

# ── Clipboard Manager ────────────────────────────────────────────────────────

@router.get("/clipboard/history")
async def clipboard_history(limit: int = 50, q: str = ""):
    from monitoring.clipboard_monitor import get_history
    return get_history(limit=limit, query=q)

@router.post("/clipboard/start")
async def clipboard_start():
    from monitoring.clipboard_monitor import get_monitor
    get_monitor().start()
    return {"started": True}

@router.delete("/clipboard/history")
async def clipboard_clear():
    from monitoring.clipboard_monitor import clear_history
    clear_history()
    return {"cleared": True}

# ── Network Guardian ─────────────────────────────────────────────────────────

@router.get("/network/status")
async def network_status():
    from monitoring.network_guardian import get_guardian
    return get_guardian().get_state()

@router.post("/network/start")
async def network_start():
    from monitoring.network_guardian import get_guardian
    get_guardian().start()
    return {"started": True}

# ── Gaming Monitor ───────────────────────────────────────────────────────────

@router.get("/gaming/status")
async def gaming_status():
    from monitoring.gaming_monitor import GAMING_STATE
    return dict(GAMING_STATE)

@router.post("/gaming/start")
async def gaming_start():
    from monitoring.gaming_monitor import get_monitor
    get_monitor().start()
    return {"started": True}

@router.post("/gaming/update")
async def gaming_update(payload: dict):
    from core.websocket_manager import ws_manager
    await ws_manager.broadcast("gaming_update", payload)
    return {"ok": True}

@router.get("/gaming/history")
async def gaming_history():
    from monitoring.gaming_monitor import get_sessions
    return {"sessions": get_sessions()}

# ── Activity feed + master controls ──────────────────────────────────────────

@router.get("/activity")
async def activity(limit: int = 50):
    from core.activity_log import get_events
    return {"events": get_events(limit)}

# module → (import path, getter function name)
_MODULES = {
    "face": ("monitoring.face_recognition_monitor", "get_monitor"),
    "context": ("monitoring.context_monitor", "get_monitor"),
    "meeting": ("monitoring.meeting_assistant", "get_assistant"),
    "clipboard": ("monitoring.clipboard_monitor", "get_monitor"),
    "network": ("monitoring.network_guardian", "get_guardian"),
    "gaming": ("monitoring.gaming_monitor", "get_monitor"),
}


def _module_obj(name: str):
    mod_path, getter = _MODULES[name]
    mod = __import__(mod_path, fromlist=[getter])
    return getattr(mod, getter)()


@router.post("/features/toggle")
async def features_toggle(payload: dict):
    """Start/stop a module and persist its enabled state in settings."""
    name = payload.get("module", ""); enable = bool(payload.get("enable", True))
    if name not in _MODULES:
        return {"error": f"Unknown module: {name}"}
    try:
        obj = _module_obj(name)
        if enable and hasattr(obj, "start"):
            obj.start()
        elif not enable and hasattr(obj, "stop"):
            obj.stop()
    except Exception as e:
        return {"error": str(e)}
    # persist (skip 'face' which isn't in the monitors dict by default)
    try:
        from core.settings_store import get, patch
        mons = dict(get("monitors", {})); mons[name] = enable
        patch({"monitors": mons})
    except Exception:
        pass
    return {"module": name, "enabled": enable}


@router.post("/features/start-all")
async def features_start_all():
    started = []
    for name in _MODULES:
        try:
            obj = _module_obj(name)
            if hasattr(obj, "start"): obj.start(); started.append(name)
        except Exception:
            pass
    return {"started": started}


@router.post("/features/stop-all")
async def features_stop_all():
    stopped = []
    for name in _MODULES:
        try:
            obj = _module_obj(name)
            if hasattr(obj, "stop"): obj.stop(); stopped.append(name)
        except Exception:
            pass
    return {"stopped": stopped}

# ── All Features Status ──────────────────────────────────────────────────────

@router.get("/features/status")
async def all_features_status():
    """Get status of all advanced features at once."""
    try:
        from monitoring.context_monitor import get_state as ctx
        context = ctx()
    except Exception:
        context = {}
    try:
        from monitoring.face_recognition_monitor import get_state as fs
        face = fs()
    except Exception:
        face = {}
    try:
        from monitoring.network_guardian import NETWORK_STATE
        network = {"bandwidth": NETWORK_STATE.get("bandwidth", {}), "alerts": len(NETWORK_STATE.get("alerts", []))}
    except Exception:
        network = {}
    try:
        from monitoring.gaming_monitor import GAMING_STATE
        gaming = {"active": GAMING_STATE.get("active", False), "game": GAMING_STATE.get("game", "")}
    except Exception:
        gaming = {}
    try:
        from monitoring.meeting_assistant import MEETING_STATE
        meeting = {"active": MEETING_STATE.get("active", False)}
    except Exception:
        meeting = {}

    return {
        "context": context,
        "face": face,
        "network": network,
        "gaming": gaming,
        "meeting": meeting,
    }
