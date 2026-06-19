from fastapi import APIRouter, Depends
from sqlalchemy import select

from core.database import get_db
from models.approval import PendingApproval

router = APIRouter()


@router.get("/")
async def list_pending(db=Depends(get_db)):
    result = await db.execute(
        select(PendingApproval)
        .where(PendingApproval.status == "pending")
        .order_by(PendingApproval.created_at.desc())
    )
    approvals = result.scalars().all()
    return [
        {
            "id": a.id,
            "conversation_id": a.conversation_id,
            "tool_name": a.tool_name,
            "parameters": a.parameters,
            "description": a.description,
            "created_at": a.created_at,
        }
        for a in approvals
    ]
