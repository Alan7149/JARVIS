import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.jarvis_agent import jarvis
from core.database import get_db

router = APIRouter()
logger = logging.getLogger("jarvis.api.agent")


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    device: str = "laptop"


class ApprovalRequest(BaseModel):
    conversation_id: str
    tool_use_id: str
    tool_name: str
    parameters: dict
    approved: bool
    reason: str | None = None


@router.post("/chat")
async def chat(request: ChatRequest):
    async def event_stream():
        async for chunk in jarvis.chat_stream(
            message=request.message,
            conversation_id=request.conversation_id,
            device=request.device,
        ):
            yield f"data: {json.dumps(chunk)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/approve")
async def process_approval(request: ApprovalRequest, db=Depends(get_db)):
    from datetime import datetime, timezone
    from core.audit import log_action
    from models.approval import PendingApproval

    if not request.approved:
        await log_action(
            db,
            tool_name=request.tool_name,
            parameters=request.parameters,
            result="User denied",
            approval_status="denied",
            success=False,
        )
        return {"status": "denied", "message": "Action was denied by user."}

    result = await jarvis.execute_approved_tool(
        conversation_id=request.conversation_id,
        tool_use_id=request.tool_use_id,
        tool_name=request.tool_name,
        parameters=request.parameters,
    )

    await log_action(
        db,
        tool_name=request.tool_name,
        parameters=request.parameters,
        result=result,
        approval_status="approved",
        success=True,
    )

    return {"status": "executed", "result": result}


@router.get("/conversations")
async def list_conversations():
    return {"conversations": list(jarvis.conversations.keys())}


@router.delete("/conversations/{conversation_id}")
async def clear_conversation(conversation_id: str):
    if conversation_id in jarvis.conversations:
        del jarvis.conversations[conversation_id]
    return {"status": "cleared"}
