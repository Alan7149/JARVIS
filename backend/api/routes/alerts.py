from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from core.database import get_db
from models.alert import Alert, AlertEvent
from monitoring.alert_state import get_state, snooze as snooze_alert, unsnooze as unsnooze_alert

router = APIRouter()


class AlertCreate(BaseModel):
    name: str
    description: str | None = None
    condition_type: str
    condition_config: dict
    action_type: str = "notify"
    action_config: dict = {}
    frequency_seconds: int = 300


@router.get("/")
async def list_alerts(db=Depends(get_db)):
    result = await db.execute(select(Alert).order_by(Alert.created_at.desc()))
    alerts = result.scalars().all()
    out = []
    for a in alerts:
        st = get_state(a.id)
        out.append({
            "id": a.id,
            "name": a.name,
            "condition_type": a.condition_type,
            "is_active": a.is_active,
            "last_checked": a.last_checked,
            "last_triggered": a.last_triggered,
            "triggered": st.get("triggered", False),
            "down_since": st.get("down_since"),
            "snoozed_until": st.get("snoozed_until"),
        })
    return out


@router.post("/")
async def create_alert(payload: AlertCreate, db=Depends(get_db)):
    alert = Alert(
        name=payload.name,
        description=payload.description,
        condition_type=payload.condition_type,
        condition_config=payload.condition_config,
        action_type=payload.action_type,
        action_config=payload.action_config,
        frequency_seconds=payload.frequency_seconds,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return {"id": alert.id, "name": alert.name}


@router.patch("/{alert_id}/toggle")
async def toggle_alert(alert_id: int, db=Depends(get_db)):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = not alert.is_active
    await db.commit()
    return {"id": alert.id, "is_active": alert.is_active}


class SnoozeBody(BaseModel):
    hours: float = 1.0


@router.post("/{alert_id}/snooze")
async def snooze_endpoint(alert_id: int, body: SnoozeBody, db=Depends(get_db)):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    until = snooze_alert(alert_id, body.hours)
    return {"id": alert_id, "snoozed_until": until}


@router.post("/{alert_id}/unsnooze")
async def unsnooze_endpoint(alert_id: int, db=Depends(get_db)):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    unsnooze_alert(alert_id)
    return {"id": alert_id, "snoozed_until": None}


@router.delete("/{alert_id}")
async def delete_alert(alert_id: int, db=Depends(get_db)):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.delete(alert)
    await db.commit()
    return {"status": "deleted"}


@router.get("/events")
async def alert_events(limit: int = 50, db=Depends(get_db)):
    result = await db.execute(
        select(AlertEvent).order_by(AlertEvent.created_at.desc()).limit(limit)
    )
    events = result.scalars().all()
    return [
        {"id": e.id, "alert_id": e.alert_id, "message": e.message, "severity": e.severity, "created_at": e.created_at}
        for e in events
    ]
