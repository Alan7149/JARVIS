import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from core.config import settings
from core.websocket_manager import ws_manager

router = APIRouter()
logger = logging.getLogger("jarvis.webhooks")


class PhoneEvent(BaseModel):
    device_name: str
    event_type: str  # battery_low | location | notification | voice_command | status
    command: str | None = None   # flat field — easier for Apple Shortcuts
    data: dict | None = None
    timestamp: str | None = None


@router.post("/phone")
async def phone_webhook(
    event: PhoneEvent,
    x_api_key: str | None = Header(default=None),
):
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    logger.info("Phone event from %s: %s", event.device_name, event.event_type)

    await ws_manager.broadcast("phone_event", {
        "device": event.device_name,
        "type": event.event_type,
        "data": event.data,
        "timestamp": event.timestamp or datetime.now(timezone.utc).isoformat(),
    })

    if event.event_type == "battery_low":
        from notifications.notifier import send_notification
        level = event.command or (event.data or {}).get("level", "?")
        await send_notification(
            title=f"Phone Battery Low — {event.device_name}",
            message=f"Battery at {level}%. Charge your phone.",
            severity="warning",
        )
        # Battery Saver Mode: dim laptop screen + speak alert
        import subprocess, threading
        def _battery_saver():
            from voice.wake_word import _speak
            _speak(f"Sir, your iPhone battery is at {level} percent. Activating battery saver mode.")
            # Dim laptop screen to 30%
            try:
                subprocess.run(
                    ["powershell", "-WindowStyle", "Hidden", "-Command",
                     "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, 30)"],
                    creationflags=subprocess.CREATE_NO_WINDOW, check=False
                )
            except Exception:
                pass
        threading.Thread(target=_battery_saver, daemon=True).start()

    elif event.event_type == "voice_command":
        command = event.command or (event.data or {}).get("command", "")
        if command:
            from agent.jarvis_agent import jarvis
            result_text = ""
            async for chunk in jarvis.chat_stream(message=command, device=event.device_name):
                if chunk.get("type") == "text":
                    result_text += chunk["data"]
            return {"status": "processed", "response": result_text}

    return {"status": "received"}
