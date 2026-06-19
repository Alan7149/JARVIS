"""Wake word control API."""
from fastapi import APIRouter

router = APIRouter()


@router.post("/speaking")
async def set_speaking(payload: dict):
    """Called by TTS tools to broadcast speaking state."""
    from core.websocket_manager import ws_manager
    await ws_manager.broadcast("jarvis_speaking", {"speaking": payload.get("speaking", False)})
    return {"ok": True}
_active = False


@router.get("/status")
async def status():
    from voice.wake_word import get_listener
    try:
        listener = get_listener()
        return {"active": listener.running}
    except Exception as e:
        return {"active": False, "error": str(e)}


@router.post("/start")
async def start():
    global _active
    from voice.wake_word import start_wake_word
    start_wake_word()
    _active = True
    return {"started": True, "message": "Say 'Hey JARVIS' to activate"}


@router.post("/stop")
async def stop():
    global _active
    from voice.wake_word import stop_wake_word
    stop_wake_word()
    _active = False
    return {"stopped": True}


@router.post("/test")
async def test_briefing():
    """Manually trigger the daily briefing (for testing)."""
    from monitoring.daily_briefing import run_daily_briefing
    await run_daily_briefing()
    return {"triggered": True}
