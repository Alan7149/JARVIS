import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from models.audit_log import AuditLog

logger = logging.getLogger("jarvis.audit")


async def log_action(
    db: AsyncSession,
    tool_name: str,
    parameters: dict,
    result: str,
    device: str = "laptop",
    requester: str = "user",
    approval_status: str = "auto",
    success: bool = True,
):
    entry = AuditLog(
        tool_name=tool_name,
        parameters=parameters,
        result=result[:2000] if result else "",
        device=device,
        requester=requester,
        approval_status=approval_status,
        success=success,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(entry)
    await db.commit()
    logger.info(
        "AUDIT | tool=%s device=%s requester=%s approval=%s success=%s",
        tool_name, device, requester, approval_status, success,
    )
