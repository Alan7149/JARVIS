import asyncio
import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import agent, alerts, approvals, devices, files, health, logs, phone, tools, voice, webhooks, weather, chat_history, wake_word as wake_word_router, features, overlay, remote, phase3, iphone_setup, mirror, mega_features, music as music_router, code_intelligence, brain_graph, threat_matrix, intel_feed, settings_api, command_deck, warroom, reactor
from core.config import settings
from core.database import init_db
from core.redis_client import init_redis
from core.scheduler import start_scheduler, stop_scheduler
from core.websocket_manager import ws_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("jarvis")


def _start_monitors():
    """Start all background monitoring services."""
    import threading

    def _run(name, fn):
        try:
            fn()
            logger.info("%s started", name)
        except Exception as e:
            logger.warning("%s failed to start: %s", name, e)

    # Context awareness (requires pywin32)
    threading.Thread(target=_run, args=("Context monitor",
        lambda: __import__('monitoring.context_monitor', fromlist=['get_monitor']).get_monitor().start()
    ), daemon=True).start()

    # Clipboard monitor (requires pywin32/pyperclip)
    threading.Thread(target=_run, args=("Clipboard monitor",
        lambda: __import__('monitoring.clipboard_monitor', fromlist=['get_monitor']).get_monitor().start()
    ), daemon=True).start()

    # Network guardian
    threading.Thread(target=_run, args=("Network guardian",
        lambda: __import__('monitoring.network_guardian', fromlist=['get_guardian']).get_guardian().start()
    ), daemon=True).start()

    # Gaming monitor
    threading.Thread(target=_run, args=("Gaming monitor",
        lambda: __import__('monitoring.gaming_monitor', fromlist=['get_monitor']).get_monitor().start()
    ), daemon=True).start()

    # Meeting assistant
    threading.Thread(target=_run, args=("Meeting assistant",
        lambda: __import__('monitoring.meeting_assistant', fromlist=['get_assistant']).get_assistant().start()
    ), daemon=True).start()

    # Proactive JARVIS
    threading.Thread(target=_run, args=("Proactive JARVIS",
        lambda: __import__('monitoring.proactive_jarvis', fromlist=['start']).start()
    ), daemon=True).start()

    # Parallel Task Ghost
    threading.Thread(target=_run, args=("Parallel Ghost",
        lambda: __import__('monitoring.parallel_ghost', fromlist=['start']).start()
    ), daemon=True).start()

    # Terminal assistant
    threading.Thread(target=_run, args=("Terminal assistant",
        lambda: __import__('monitoring.terminal_assistant', fromlist=['get_assistant']).get_assistant().start()
    ), daemon=True).start()

    # Predictive engine
    threading.Thread(target=_run, args=("Predictive engine",
        lambda: __import__('monitoring.predictive_engine', fromlist=['get_engine']).get_engine().start()
    ), daemon=True).start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("JARVIS initializing...")
    await init_db()
    await init_redis()
    await start_scheduler()
    logger.info("JARVIS online. All systems nominal.")

    # Run system checks in background (don't block startup)
    async def _delayed_check():
        await asyncio.sleep(3)  # let server fully start first
        try:
            from monitoring.system_monitor import run_system_checks
            await run_system_checks()
            logger.info("Initial system check complete")
        except Exception as e:
            logger.warning("Initial system check failed: %s", e)
    asyncio.create_task(_delayed_check())

    # Pre-warm pages so first load is instant (these do slow I/O)
    async def _prewarm_pages():
        await asyncio.sleep(4)
        # Mission + Threat are quick — warm them first
        for name, mod in (("threat", "api.routes.threat_matrix"),):
            try:
                m = __import__(mod, fromlist=["prewarm"])
                await m.prewarm()
            except Exception as e:
                logger.warning("%s prewarm failed: %s", name, e)
        # Intel is slow (web search) — warm last
        try:
            from api.routes.intel_feed import prewarm as intel_prewarm
            await intel_prewarm()
        except Exception as e:
            logger.warning("Intel prewarm failed: %s", e)
    asyncio.create_task(_prewarm_pages())

    # Auto-start advanced monitors
    _start_monitors()

    # Auto-start wake word if enabled
    if settings.WAKE_WORD_ENABLED:
        try:
            from voice.wake_word import start_wake_word
            start_wake_word()
            logger.info("Wake word listener active — say 'Hey JARVIS'")
        except Exception as e:
            logger.warning("Wake word listener failed to start: %s", e)

    yield
    logger.info("JARVIS shutting down...")
    await stop_scheduler()


app = FastAPI(
    title="JARVIS",
    description="Just A Rather Very Intelligent System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/health", tags=["health"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(tools.router, prefix="/api/tools", tags=["tools"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["approvals"])
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(phone.router, prefix="/api/phone", tags=["phone"])
app.include_router(weather.router, prefix="/api/weather", tags=["weather"])
app.include_router(chat_history.router, prefix="/api/chat", tags=["chat"])
app.include_router(wake_word_router.router, prefix="/api/wake-word", tags=["wake-word"])
app.include_router(features.router, prefix="/api", tags=["features"])
app.include_router(overlay.router, tags=["overlay"])
app.include_router(remote.router, tags=["remote"])
app.include_router(phase3.router, prefix="/api", tags=["phase3"])
app.include_router(iphone_setup.router, tags=["iphone-setup"])
app.include_router(mirror.router, tags=["mirror"])
app.include_router(mega_features.router, prefix="/api", tags=["mega"])
app.include_router(music_router.router, prefix="/api", tags=["music"])
app.include_router(code_intelligence.router, prefix="/api", tags=["code"])
app.include_router(brain_graph.router, tags=["brain-graph"])
app.include_router(threat_matrix.router, prefix="/api", tags=["threat"])
app.include_router(intel_feed.router, prefix="/api", tags=["intel"])
app.include_router(settings_api.router, prefix="/api", tags=["settings"])
app.include_router(command_deck.router, prefix="/api", tags=["deck"])
from api.routes import news, gitlab, calendar_api
app.include_router(news.router, prefix="/api", tags=["news"])
app.include_router(gitlab.router, prefix="/api", tags=["gitlab"])
app.include_router(calendar_api.router, prefix="/api", tags=["calendar"])
app.include_router(warroom.router, prefix="/api", tags=["warroom"])
app.include_router(reactor.router, prefix="/api", tags=["reactor"])

from api.ws import ws_router
app.include_router(ws_router)

if os.path.exists("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )
