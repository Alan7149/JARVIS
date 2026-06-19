"""Chat history persistence API."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select, delete
from core.database import get_db
from models.chat import ChatSession, ChatMessage

router = APIRouter()


@router.get("/sessions")
async def list_sessions(limit: int = 50, db=Depends(get_db)):
    result = await db.execute(
        select(ChatSession).order_by(ChatSession.updated_at.desc()).limit(limit)
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id, "session_id": s.session_id, "title": s.title,
            "device": s.device, "message_count": s.message_count,
            "created_at": s.created_at, "updated_at": s.updated_at,
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}/messages")
async def get_messages(session_id: str, db=Depends(get_db)):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    msgs = result.scalars().all()
    return [
        {
            "id": m.id, "role": m.role, "content": m.content,
            "tool_name": m.tool_name, "created_at": m.created_at,
        }
        for m in msgs
    ]


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db=Depends(get_db)):
    await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
    await db.execute(delete(ChatSession).where(ChatSession.session_id == session_id))
    await db.commit()
    return {"deleted": True}


@router.delete("/sessions")
async def clear_all_sessions(db=Depends(get_db)):
    await db.execute(delete(ChatMessage))
    await db.execute(delete(ChatSession))
    await db.commit()
    return {"deleted": True}
