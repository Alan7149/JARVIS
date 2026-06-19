"""Unified routes for all mega features."""
import asyncio
import logging
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger("jarvis.mega")

# ── Proactive JARVIS ──────────────────────────────────────────────────────────

@router.get("/proactive/status")
async def proactive_status():
    from monitoring.proactive_jarvis import get_state
    return get_state()

@router.post("/proactive/focus-shield")
async def start_focus_shield(payload: dict = {}):
    from monitoring.proactive_jarvis import activate_focus_shield
    minutes = payload.get("minutes", 120)
    activate_focus_shield(minutes)
    return {"active": True, "minutes": minutes}

@router.post("/proactive/focus-shield/stop")
async def stop_focus_shield():
    from monitoring.proactive_jarvis import deactivate_focus_shield
    deactivate_focus_shield()
    return {"active": False}

@router.post("/proactive/break-reset")
async def reset_break_timer():
    from monitoring.proactive_jarvis import STATE
    import time
    STATE["last_break"] = time.time()
    return {"reset": True}

@router.post("/proactive/dnd")
async def set_dnd(payload: dict = {}):
    """Set do-not-disturb for N minutes."""
    from monitoring.proactive_jarvis import set_dnd
    minutes = payload.get("minutes", 60)
    set_dnd(minutes)
    return {"dnd_active": True, "minutes": minutes}

@router.post("/proactive/dnd/clear")
async def clear_dnd():
    from monitoring.proactive_jarvis import STATE
    STATE["dnd_until"] = 0
    return {"dnd_active": False}

@router.get("/proactive/status")
async def proactive_status():
    from monitoring.proactive_jarvis import get_state, _is_work_mode, _is_dnd
    state = get_state()
    state["in_work_mode"] = _is_work_mode()
    state["dnd_active"] = _is_dnd()
    return state

# ── Intelligence Tools ────────────────────────────────────────────────────────

@router.post("/intelligence/eli5")
async def eli5(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.eli5(payload.get("topic", ""))

@router.post("/intelligence/fact-check")
async def fact_check(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.fact_check(payload.get("claim", ""))

@router.post("/intelligence/devils-advocate")
async def devils_advocate(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.devils_advocate(payload.get("position", ""))

@router.post("/intelligence/first-principles")
async def first_principles(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.first_principles(payload.get("problem", ""))

@router.post("/intelligence/research")
async def research(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.research_brief(payload.get("topic", ""))

@router.post("/intelligence/book-summary")
async def book_summary(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.book_summary(payload.get("title", ""), payload.get("author", ""))

@router.post("/intelligence/summarize-url")
async def summarize_url(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.summarize_url(payload.get("url", ""))

@router.post("/intelligence/check-patent")
async def check_patent(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.check_patent(payload.get("idea", ""))

@router.post("/intelligence/email-tone")
async def email_tone(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.email_tone_check(payload.get("email", ""))

@router.post("/intelligence/presentation")
async def presentation(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.presentation_builder(payload.get("topic", ""), payload.get("slides", 10))

@router.post("/intelligence/negotiation-coach")
async def negotiation_coach(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.negotiation_coach(payload.get("scenario", ""))

@router.post("/intelligence/crisis-response")
async def crisis_response(payload: dict):
    from tools.intelligence_tools import IntelligenceTools
    return await IntelligenceTools.crisis_response(payload.get("situation", ""))

# ── Security Suite ────────────────────────────────────────────────────────────

@router.post("/security/breach-check")
async def breach_check(payload: dict):
    from tools.security_tools import SecurityTools
    return await SecurityTools.check_breach(payload.get("email", ""))

@router.get("/security/app-permissions")
async def app_permissions():
    from tools.security_tools import SecurityTools
    return await SecurityTools.audit_app_permissions()

@router.get("/security/vpn-status")
async def vpn_status():
    from tools.security_tools import SecurityTools
    return await SecurityTools.check_vpn()

@router.post("/security/scan-deps")
async def scan_deps(payload: dict):
    from tools.security_tools import SecurityTools
    return await SecurityTools.scan_vulnerable_deps(payload.get("path", "."))

# ── Multi-Monitor HUD ─────────────────────────────────────────────────────────

@router.get("/hud/monitor/{monitor_id}")
async def monitor_hud(monitor_id: int):
    """Different HUD for different monitors."""
    from fastapi.responses import HTMLResponse
    pages = {
        1: "chat",       # Monitor 1: Chat interface
        2: "status",     # Monitor 2: System stats
        3: "advanced",   # Monitor 3: Advanced monitors
    }
    page = pages.get(monitor_id, "status")
    return HTMLResponse(content=f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>JARVIS Monitor {monitor_id}</title>
<meta http-equiv="refresh" content="0;url=http://localhost:8000/#{page}">
</head><body style="background:#020b18">
<script>window.location.replace('http://localhost:8000/#{page}')</script>
</body></html>""")

# ── Focus Shield Dashboard ────────────────────────────────────────────────────

@router.post("/negotiation/briefing")
async def negotiation_briefing(payload: dict):
    from tools.negotiation_room import build_briefing
    return await build_briefing(
        scenario=payload.get("scenario",""),
        their_name=payload.get("their_name",""),
        your_goal=payload.get("your_goal",""),
        context=payload.get("context",""),
    )

@router.post("/negotiation/counter")
async def negotiation_counter(payload: dict):
    from tools.negotiation_room import quick_counter
    return await quick_counter(payload.get("statement",""), payload.get("context",""))

@router.get("/ghost/status")
async def ghost_status():
    from monitoring.parallel_ghost import get_status
    return get_status()

@router.post("/ghost/queue")
async def ghost_queue(payload: dict):
    from monitoring.parallel_ghost import queue_task
    queue_task(payload.get("type","research"), payload.get("subject",""), payload.get("context",""))
    return {"queued": True}

@router.get("/focus/status")
async def focus_status():
    from monitoring.proactive_jarvis import STATE
    import time
    active = STATE.get("focus_shield_active", False)
    end = STATE.get("focus_end_time", 0)
    remaining = max(0, int(end - time.time())) if active else 0
    return {
        "active": active,
        "remaining_seconds": remaining,
        "remaining_minutes": remaining // 60,
    }
