"""
JARVIS Command Deck — live reasoning terminal.
Streams the agent's thought process: intent parsing → tool calls →
synthesis → response. Works with the Groq brain by adding an explicit
reasoning + tool-detection layer on top of the chat model.
"""
import asyncio
import json
import logging
import re
import time
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()
logger = logging.getLogger("jarvis.deck")


# Intent → tool routing (keyword based, fast, no extra LLM round-trip)
INTENT_RULES = [
    (r"\b(weather|temperature|forecast|rain|hot|cold outside)\b", "get_weather", "Checking live weather data"),
    (r"\b(search|look up|google|find online|latest news|who is|what is the latest)\b", "web_search", "Searching the web"),
    (r"\b(cpu|ram|memory|system status|how.*(pc|computer|machine)|performance)\b", "get_system_status", "Reading system vitals"),
    (r"\b(disk|storage|drive|space)\b", "get_disk_usage", "Analyzing disk usage"),
    (r"\b(process|running|task manager|whats running)\b", "get_running_processes", "Enumerating processes"),
    (r"\b(my notes|second brain|knowledge|i wrote|remember.*(note|doc))\b", "search_documents", "Querying your Second Brain"),
    (r"\b(git|commit|branch|repo|diff)\b", "get_git_status", "Inspecting git state"),
]


def _detect_tool(message: str):
    msg = message.lower()
    for pattern, tool, label in INTENT_RULES:
        if re.search(pattern, msg):
            return tool, label
    return None, None


def _tool_args(tool: str, message: str) -> dict:
    if tool == "web_search":
        return {"query": message, "max_results": 4}
    if tool == "get_weather":
        return {"location": "auto"}
    if tool == "search_documents":
        return {"query": message, "limit": 5}
    return {}


def _sse(event_type: str, data) -> str:
    return f"data: {json.dumps({'type': event_type, 'data': data, 't': round(time.time(), 3)})}\n\n"


@router.post("/deck/run")
async def deck_run(payload: dict):
    message = (payload.get("message") or "").strip()
    conversation_id = payload.get("conversation_id")

    async def stream():
        if not message:
            yield _sse("error", "Empty command")
            yield "data: [DONE]\n\n"
            return

        t0 = time.time()
        # ── Phase 1: intake ──────────────────────────────────────────
        yield _sse("phase", {"step": "intake", "label": "Receiving command", "status": "active"})
        await asyncio.sleep(0.15)
        yield _sse("log", f'Command received: "{message[:80]}"')
        yield _sse("phase", {"step": "intake", "label": "Command received", "status": "done"})

        # ── Phase 2: intent parsing ──────────────────────────────────
        yield _sse("phase", {"step": "parse", "label": "Parsing intent", "status": "active"})
        await asyncio.sleep(0.2)
        tool, tool_label = _detect_tool(message)
        if tool:
            yield _sse("log", f"Intent resolved → action required: {tool}")
        else:
            yield _sse("log", "Intent resolved → conversational response")
        yield _sse("phase", {"step": "parse", "label": "Intent parsed", "status": "done"})

        tool_context = ""

        # ── Phase 3: tool execution (if needed) ──────────────────────
        if tool:
            yield _sse("phase", {"step": "tool", "label": tool_label, "status": "active"})
            yield _sse("tool_call", {"name": tool, "input": _tool_args(tool, message)})
            try:
                from agent.tool_registry import execute_tool
                result = await asyncio.wait_for(
                    execute_tool(tool, _tool_args(tool, message)), timeout=15
                )
                if not isinstance(result, str):
                    result = json.dumps(result, default=str)
                tool_context = result[:2000]
                preview = result[:300]
                yield _sse("tool_result", {"name": tool, "result": preview})
                yield _sse("phase", {"step": "tool", "label": f"{tool_label} — complete", "status": "done"})
            except Exception as e:
                yield _sse("tool_error", {"name": tool, "error": str(e)})
                yield _sse("phase", {"step": "tool", "label": f"{tool_label} — failed", "status": "error"})

        # ── Phase 4: synthesis ───────────────────────────────────────
        yield _sse("phase", {"step": "compose", "label": "Composing response", "status": "active"})
        await asyncio.sleep(0.1)

        reply = ""
        try:
            from core.config import settings
            from agent.jarvis_agent import _groq_chat, SYSTEM_PROMPT
            from datetime import date
            system = SYSTEM_PROMPT.format(date=date.today().isoformat())
            prompt = message
            if tool_context:
                prompt = (f"{message}\n\n[Live data retrieved for you:\n{tool_context}\n]\n"
                          f"Answer using this data, concisely and in JARVIS's voice.")
            reply = await _groq_chat(prompt, [], system)
        except Exception as e:
            reply = f"Reasoning core error: {e}"

        yield _sse("phase", {"step": "compose", "label": "Response ready", "status": "done"})

        # Stream the reply word-by-word for the live-typing effect
        words = reply.split(" ")
        for i in range(0, len(words), 3):
            chunk = " ".join(words[i:i + 3])
            yield _sse("text", chunk + " ")
            await asyncio.sleep(0.02)

        elapsed = round(time.time() - t0, 2)
        yield _sse("done", {"elapsed": elapsed, "used_tool": tool})
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
