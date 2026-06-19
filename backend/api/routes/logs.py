from fastapi import APIRouter, Depends
from sqlalchemy import select

from core.database import get_db
from models.audit_log import AuditLog

router = APIRouter()


@router.get("/")
async def get_audit_logs(limit: int = 100, tool_name: str | None = None, db=Depends(get_db)):
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    if tool_name:
        stmt = stmt.where(AuditLog.tool_name == tool_name)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "tool_name": l.tool_name,
            "device": l.device,
            "requester": l.requester,
            "approval_status": l.approval_status,
            "success": l.success,
            "timestamp": l.timestamp,
            "result_preview": (l.result or "")[:200],
        }
        for l in logs
    ]
