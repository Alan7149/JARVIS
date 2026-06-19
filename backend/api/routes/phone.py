import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from tools.phone_tools import PhoneTools

router = APIRouter()
logger = logging.getLogger("jarvis.phone_api")

# In-memory screenshot cache for polling
_screenshot_cache: dict[str, bytes] = {}
_screenshot_task: asyncio.Task | None = None


class TapRequest(BaseModel):
    x: int
    y: int
    serial: str | None = None


class SwipeRequest(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    duration_ms: int = 300
    serial: str | None = None


class TextRequest(BaseModel):
    text: str
    serial: str | None = None


class KeyRequest(BaseModel):
    keycode: str
    serial: str | None = None


class AppRequest(BaseModel):
    package_name: str
    serial: str | None = None


class WirelessConnectRequest(BaseModel):
    ip: str
    port: int = 5555


@router.get("/devices")
async def list_devices():
    result = await PhoneTools.list_devices()
    return {"output": result}


@router.get("/info")
async def phone_info(serial: str | None = Query(default=None)):
    result = await PhoneTools.get_phone_info(serial)
    return {"output": result}


@router.get("/battery")
async def battery(serial: str | None = Query(default=None)):
    result = await PhoneTools.get_battery_status(serial)
    return {"output": result}


@router.get("/screenshot")
async def screenshot(serial: str | None = Query(default=None)):
    """Returns phone screenshot as PNG image."""
    proc = await asyncio.create_subprocess_exec(
        "adb", *(["-s", serial] if serial else []), "exec-out", "screencap", "-p",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Screenshot timeout")

    if proc.returncode != 0 or not stdout:
        raise HTTPException(status_code=503, detail=f"ADB error: {stderr.decode()}")

    return Response(content=stdout, media_type="image/png")


@router.post("/tap")
async def tap(req: TapRequest):
    result = await PhoneTools.tap(req.x, req.y, req.serial)
    return {"result": result}


@router.post("/swipe")
async def swipe(req: SwipeRequest):
    result = await PhoneTools.swipe(req.x1, req.y1, req.x2, req.y2, req.duration_ms, req.serial)
    return {"result": result}


@router.post("/type")
async def type_text(req: TextRequest):
    result = await PhoneTools.type_text(req.text, req.serial)
    return {"result": result}


@router.post("/key")
async def press_key(req: KeyRequest):
    result = await PhoneTools.press_key(req.keycode, req.serial)
    return {"result": result}


@router.post("/launch-app")
async def launch_app(req: AppRequest):
    result = await PhoneTools.launch_app(req.package_name, req.serial)
    return {"result": result}


@router.get("/apps")
async def list_apps(serial: str | None = Query(default=None)):
    result = await PhoneTools.list_installed_apps(serial)
    return {"apps": result.split("\n") if result else []}


@router.get("/notifications")
async def notifications(serial: str | None = Query(default=None)):
    result = await PhoneTools.get_notifications(serial)
    return {"output": result}


@router.post("/scrcpy")
async def launch_scrcpy(serial: str | None = None, options: str = ""):
    result = await PhoneTools.launch_scrcpy(serial, options)
    return {"result": result}


@router.post("/connect-wireless")
async def connect_wireless(req: WirelessConnectRequest):
    result = await PhoneTools.connect_wireless(req.ip, req.port)
    return {"result": result}


# Predefined gesture shortcuts
GESTURE_SHORTCUTS = {
    "home": ["KEYCODE_HOME"],
    "back": ["KEYCODE_BACK"],
    "recents": ["KEYCODE_APP_SWITCH"],
    "power": ["KEYCODE_POWER"],
    "volume_up": ["KEYCODE_VOLUME_UP"],
    "volume_down": ["KEYCODE_VOLUME_DOWN"],
    "mute": ["KEYCODE_VOLUME_MUTE"],
    "screenshot_hw": ["KEYCODE_SYSRQ"],
    "lock": ["KEYCODE_SLEEP"],
}


@router.post("/gesture/{name}")
async def gesture(name: str, serial: str | None = Query(default=None)):
    if name not in GESTURE_SHORTCUTS:
        raise HTTPException(status_code=400, detail=f"Unknown gesture. Options: {list(GESTURE_SHORTCUTS.keys())}")
    keycode = GESTURE_SHORTCUTS[name][0]
    result = await PhoneTools.press_key(keycode, serial)
    return {"result": result, "gesture": name}
