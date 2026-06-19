import json
import logging
import uuid
from typing import AsyncGenerator

import anthropic

from agent.tool_registry import get_all_tools, execute_tool
from core.config import settings
from core.permissions import check_permission, is_blocked, requires_approval, PermissionLevel

logger = logging.getLogger("jarvis.agent")


async def _persist_chat(db, session_id: str, user_msg: str, assistant_msg: str, device: str):
    """Save a conversation turn to the database."""
    from datetime import datetime, timezone
    from sqlalchemy import select
    from models.chat import ChatSession, ChatMessage

    now = datetime.now(timezone.utc)
    # Upsert session
    result = await db.execute(select(ChatSession).where(ChatSession.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        # Auto-generate title from first message
        title = user_msg[:60] + ("..." if len(user_msg) > 60 else "")
        session = ChatSession(session_id=session_id, title=title, device=device,
                              message_count=0, created_at=now, updated_at=now)
        db.add(session)
    session.message_count += 2
    session.updated_at = now

    # Save messages
    db.add(ChatMessage(session_id=session_id, role="user", content=user_msg, created_at=now))
    db.add(ChatMessage(session_id=session_id, role="assistant", content=assistant_msg, created_at=now))
    await db.commit()


async def _groq_chat(message: str, history: list, system: str) -> str:
    """Simple Groq fallback — no tool use, just conversation."""
    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    messages = [{"role": "system", "content": system}] + history
    messages.append({"role": "user", "content": message})
    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        max_tokens=1024,
    )
    return response.choices[0].message.content

SYSTEM_PROMPT = """You are JARVIS — Just A Rather Very Intelligent System. You are a sophisticated, highly capable personal AI assistant integrated into the user's laptop, devices, and digital life.

Your personality:
- Precise, elegant, and efficient like the JARVIS from Iron Man
- Address the user respectfully; use "Certainly," "Of course," "Right away" naturally
- Proactive: if you notice something relevant while completing a task, mention it
- Honest about limitations and when something requires user approval
- Never verbose — be thorough but concise

Your capabilities:
- Read files, search code, analyze projects
- Monitor system health (CPU, RAM, disk, network)
- Check running processes and services
- Git operations (read, diff, log; commit/push require approval)
- Run safe build/test commands
- Index and search documents across devices
- Set and manage alerts
- Control applications on the laptop
- Receive data from connected phones/devices
- Search the web in real-time (web_search)
- Get weather forecasts (get_weather)
- Capture and analyze the screen with vision AI (analyze_screen)
- Remember and recall facts about the user (remember/recall/recall_all/forget)
- Speak responses aloud on the laptop (speak)
- Send push notifications to the user's phone (send_push_notification)
- Read Google Calendar events (get_calendar_events)
- Read and send Gmail (get_gmail_inbox / send_email — email requires approval)

Memory guidelines:
- Proactively remember important facts the user tells you (name, preferences, projects, etc.)
- At the start of important conversations, recall relevant memories
- Always use the user's name if you know it

Security model you must follow:
- Level 1 (Read only): Execute immediately
- Level 2 (Safe action): Execute immediately
- Level 3 (Requires confirmation): Ask user before executing
- Level 4 (Blocked): Refuse and explain why

When a tool requires approval, say something like:
"I can do that. This action requires your approval before I proceed: [describe what will happen]. Shall I continue?"

Always be transparent about what you're doing. If you read files, say so briefly. If you find something interesting or concerning, flag it.

Current date: {date}
"""


class JarvisAgent:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.conversations: dict[str, list] = {}

    def _get_or_create_conversation(self, conversation_id: str) -> list:
        if conversation_id not in self.conversations:
            self.conversations[conversation_id] = []
        return self.conversations[conversation_id]

    def new_conversation(self) -> str:
        cid = str(uuid.uuid4())
        self.conversations[cid] = []
        return cid

    async def chat_stream(
        self,
        message: str,
        conversation_id: str | None = None,
        device: str = "laptop",
    ) -> AsyncGenerator[dict, None]:
        from datetime import date
        system = SYSTEM_PROMPT.format(date=date.today().isoformat())

        # Use Groq if Anthropic key is missing
        if not settings.ANTHROPIC_API_KEY and settings.GROQ_API_KEY:
            if not conversation_id:
                conversation_id = self.new_conversation()
            history = self._get_or_create_conversation(conversation_id)
            yield {"type": "conversation_id", "data": conversation_id}
            try:
                reply = await _groq_chat(message, history, system)
                history.append({"role": "user", "content": message})
                history.append({"role": "assistant", "content": reply})
                yield {"type": "text", "data": reply}
                # Persist to DB + audit log
                try:
                    from core.database import AsyncSessionLocal
                    from core.audit import log_action
                    async with AsyncSessionLocal() as db:
                        await _persist_chat(db, conversation_id, message, reply, device)
                        await log_action(db, tool_name="groq_chat", parameters={"message": message[:200]},
                                        result=reply[:500], device=device, requester="user", approval_status="auto")
                except Exception:
                    pass
            except Exception as e:
                yield {"type": "text", "data": f"Groq error: {e}"}
            yield {"type": "done", "data": ""}
            return

        if not settings.ANTHROPIC_API_KEY:
            yield {"type": "text", "data": "No AI API key configured. Add ANTHROPIC_API_KEY or GROQ_API_KEY to backend/.env"}
            yield {"type": "done", "data": ""}
            return

        if not conversation_id:
            conversation_id = self.new_conversation()

        history = self._get_or_create_conversation(conversation_id)
        history.append({"role": "user", "content": message})

        tools = get_all_tools()
        pending_approvals = []

        yield {"type": "conversation_id", "data": conversation_id}

        while True:
            response = await self.client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT.format(date=date.today().isoformat()),
                messages=history,
                tools=tools,
            )

            assistant_content = []
            text_buffer = ""

            for block in response.content:
                if block.type == "text":
                    text_buffer += block.text
                    yield {"type": "text", "data": block.text}
                elif block.type == "tool_use":
                    assistant_content.append(block)

            if text_buffer:
                assistant_content_for_history = []
                if text_buffer:
                    assistant_content_for_history.append({"type": "text", "text": text_buffer})
                for block in assistant_content:
                    if hasattr(block, "type") and block.type == "tool_use":
                        assistant_content_for_history.append({
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        })
                if assistant_content_for_history:
                    history.append({"role": "assistant", "content": assistant_content_for_history})

            if response.stop_reason == "end_turn":
                if not text_buffer:
                    history.append({"role": "assistant", "content": response.content})
                break

            if response.stop_reason == "tool_use":
                tool_uses = [b for b in response.content if b.type == "tool_use"]

                if not text_buffer:
                    history.append({"role": "assistant", "content": response.content})

                tool_results = []
                for tool_use in tool_uses:
                    tool_name = tool_use.name
                    tool_input = tool_use.input

                    yield {"type": "tool_call", "data": {"name": tool_name, "input": tool_input}}

                    if is_blocked(tool_name):
                        result = f"BLOCKED: The tool '{tool_name}' is not permitted by JARVIS security policy."
                        yield {"type": "tool_result", "data": {"name": tool_name, "result": result, "blocked": True}}
                    elif requires_approval(tool_name):
                        result = f"APPROVAL_REQUIRED:{tool_use.id}"
                        pending_approvals.append({
                            "tool_use_id": tool_use.id,
                            "tool_name": tool_name,
                            "parameters": tool_input,
                            "conversation_id": conversation_id,
                        })
                        yield {
                            "type": "approval_required",
                            "data": {
                                "tool_use_id": tool_use.id,
                                "tool_name": tool_name,
                                "parameters": tool_input,
                            }
                        }
                        result = "Waiting for user approval before executing this action."
                    else:
                        try:
                            result = await execute_tool(tool_name, tool_input)
                            if not isinstance(result, str):
                                result = json.dumps(result, default=str)
                            yield {"type": "tool_result", "data": {"name": tool_name, "result": result}}
                        except Exception as e:
                            result = f"Error executing {tool_name}: {str(e)}"
                            logger.error("Tool execution error: %s", e, exc_info=True)
                            yield {"type": "tool_error", "data": {"name": tool_name, "error": str(e)}}

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use.id,
                        "content": result,
                    })

                history.append({"role": "user", "content": tool_results})

                if pending_approvals:
                    yield {"type": "pending_approvals", "data": pending_approvals}
                    break

        yield {"type": "done", "data": {"conversation_id": conversation_id}}

    async def execute_approved_tool(
        self,
        conversation_id: str,
        tool_use_id: str,
        tool_name: str,
        parameters: dict,
    ) -> str:
        try:
            result = await execute_tool(tool_name, parameters)
            if not isinstance(result, str):
                result = json.dumps(result, default=str)
            return result
        except Exception as e:
            logger.error("Approved tool execution error: %s", e, exc_info=True)
            return f"Error: {str(e)}"


jarvis = JarvisAgent()
