"""
JARVIS Parallel Task Ghost
Runs silently in the background, researching things you mention.
When you pause, delivers a consolidated brief of what it found.
"""
import asyncio
import logging
import re
import threading
import time
from collections import deque
from datetime import datetime

logger = logging.getLogger("jarvis.ghost")

# Things JARVIS picks up from your voice commands / clipboard
_task_queue: deque = deque(maxlen=20)
_completed_tasks: list[dict] = []
_brief_pending: list[dict] = []
_running = False
_last_activity = time.time()
_brief_delivered_at = 0

IDLE_THRESHOLD = 300      # 5 min idle before delivering brief
MIN_TASKS_FOR_BRIEF = 1   # deliver even with 1 completed task

# Topics that trigger auto-research
RESEARCH_TRIGGERS = [
    r'\b(error|bug|issue|problem)\s+(?:with|in|about)\s+([\w\s]+)',
    r'\b(?:how to|how do I|what is|what are)\s+([\w\s]+)',
    r'\b(?:research|find out|look up|check)\s+([\w\s]+)',
    r'\b(?:article|paper|blog|post)\s+(?:about|on)\s+([\w\s]+)',
]


def _extract_topics(text: str) -> list[str]:
    """Extract researchable topics from text."""
    topics = []
    for pattern in RESEARCH_TRIGGERS:
        matches = re.findall(pattern, text.lower())
        for m in matches:
            topic = m[-1].strip() if isinstance(m, tuple) else m.strip()
            if len(topic) > 4:
                topics.append(topic[:60])
    return topics[:3]


def record_activity(text: str = "", activity_type: str = "voice"):
    """Call this whenever the user does something — resets idle timer."""
    global _last_activity
    _last_activity = time.time()

    # Extract topics from voice commands to auto-research
    if activity_type == "voice" and text:
        topics = _extract_topics(text)
        for topic in topics:
            queue_task("research", topic, f"Mentioned during conversation: '{text[:50]}'")


def queue_task(task_type: str, subject: str, context: str = ""):
    """Add a background task to the ghost queue."""
    task = {
        "id": f"{task_type}_{int(time.time())}",
        "type": task_type,
        "subject": subject,
        "context": context,
        "queued_at": datetime.now().isoformat(),
        "status": "pending",
    }
    _task_queue.append(task)
    logger.info("Ghost task queued: %s — %s", task_type, subject[:40])


async def _run_research_task(task: dict) -> dict | None:
    """Execute a research task using web search + AI synthesis."""
    subject = task["subject"]
    try:
        from tools.search_tools import SearchTools
        from core.config import settings
        from groq import AsyncGroq

        # Web search
        search_result = await SearchTools.web_search(subject, max_results=4)
        snippets = [r.get("snippet", "") for r in search_result.get("results", [])[:4]]
        combined = "\n".join(snippets)

        if not combined.strip():
            return None

        # AI synthesis
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        resp = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{
                "role": "system",
                "content": "You are JARVIS. Summarize web research into 2 punchy sentences. Be specific and useful."
            }, {
                "role": "user",
                "content": f"Research topic: '{subject}'\n\nWeb results:\n{combined[:2000]}\n\nSummarize the key finding in 2 sentences max."
            }],
            max_tokens=150,
        )
        summary = resp.choices[0].message.content.strip()
        return {**task, "status": "done", "summary": summary, "completed_at": datetime.now().isoformat()}
    except Exception as e:
        logger.debug("Research task failed: %s", e)
        return None


async def _ghost_loop():
    """Main background loop — runs tasks and monitors for idle delivery."""
    global _brief_delivered_at

    while _running:
        # Process pending tasks
        pending = [t for t in _task_queue if t["status"] == "pending"]
        for task in pending[:2]:  # process 2 at a time
            task["status"] = "running"
            try:
                result = None
                if task["type"] == "research":
                    result = await _run_research_task(task)

                if result:
                    _completed_tasks.append(result)
                    _brief_pending.append(result)
                    logger.info("Ghost task done: %s", result.get("summary", "")[:60])
                task["status"] = "done"
            except Exception as e:
                task["status"] = "error"
                logger.debug("Ghost task error: %s", e)

        # Check if user is idle — deliver brief
        idle_time = time.time() - _last_activity
        has_unreported = [t for t in _brief_pending if t.get("status") == "done"]

        if (idle_time > IDLE_THRESHOLD and
                len(has_unreported) >= MIN_TASKS_FOR_BRIEF and
                time.time() - _brief_delivered_at > 900):  # max once per 15 min

            _brief_delivered_at = time.time()
            brief_items = has_unreported[:5]
            # Clear delivered items
            for item in brief_items:
                _brief_pending.remove(item)

            await _deliver_brief(brief_items, idle_time)

        await asyncio.sleep(30)


async def _deliver_brief(tasks: list[dict], idle_seconds: float):
    """Speak and broadcast the accumulated brief."""
    from core.websocket_manager import ws_manager
    from voice.wake_word import _speak

    idle_min = int(idle_seconds / 60)
    count = len(tasks)

    intro = f"Sir, while you were away for {idle_min} minutes, I completed {count} background task{'s' if count > 1 else ''}."
    summaries = [f"{t['subject']}: {t['summary']}" for t in tasks if t.get("summary")]

    full_brief = intro + " " + " Also: ".join(summaries[:2])

    logger.info("Delivering ghost brief: %s", full_brief[:100])
    _speak(full_brief[:600])

    await ws_manager.broadcast("ghost_brief", {
        "tasks": tasks,
        "intro": intro,
        "idle_minutes": idle_min,
        "time": datetime.now().isoformat(),
    })


def start():
    global _running
    if _running:
        return
    _running = True

    def _run():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(_ghost_loop())
        except Exception as e:
            logger.error("Ghost loop crashed: %s", e)

    threading.Thread(target=_run, daemon=True, name="jarvis-ghost").start()
    logger.info("Parallel Task Ghost started")


def stop():
    global _running
    _running = False


def get_status() -> dict:
    return {
        "running": _running,
        "queued": len([t for t in _task_queue if t["status"] == "pending"]),
        "completed_total": len(_completed_tasks),
        "pending_brief": len(_brief_pending),
        "last_activity_seconds_ago": int(time.time() - _last_activity),
        "recent_completed": _completed_tasks[-5:][::-1],
    }
