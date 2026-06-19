from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from core.database import get_db
from models.device import Device

router = APIRouter()


class DeviceRegister(BaseModel):
    name: str
    device_type: str
    platform: str | None = None
    webhook_url: str | None = None


@router.get("/")
async def list_devices(db=Depends(get_db)):
    result = await db.execute(select(Device))
    devices = result.scalars().all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "device_type": d.device_type,
            "platform": d.platform,
            "is_online": d.is_online,
            "last_seen": d.last_seen,
        }
        for d in devices
    ]


@router.post("/register")
async def register_device(payload: DeviceRegister, db=Depends(get_db)):
    device = Device(
        name=payload.name,
        device_type=payload.device_type,
        platform=payload.platform,
        webhook_url=payload.webhook_url,
        is_online=True,
        last_seen=datetime.now(timezone.utc),
        registered_at=datetime.now(timezone.utc),
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return {"id": device.id, "name": device.name}


@router.patch("/{device_id}/heartbeat")
async def device_heartbeat(device_id: int, db=Depends(get_db)):
    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device.is_online = True
    device.last_seen = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "ok"}
