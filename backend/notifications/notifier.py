import logging

import httpx

from core.config import settings
from core.websocket_manager import ws_manager

logger = logging.getLogger("jarvis.notifier")


async def send_notification(title: str, message: str, severity: str = "info"):
    """Fan-out notification to all configured channels."""
    await ws_manager.broadcast("notification", {
        "title": title,
        "message": message,
        "severity": severity,
    })

    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
        await _send_telegram(title, message)

    if settings.NTFY_URL and settings.NTFY_TOPIC:
        await _send_ntfy(title, message, severity)

    logger.info("Notification sent: [%s] %s", severity, title)


async def _send_telegram(title: str, message: str):
    try:
        text = f"*{title}*\n{message}"
        url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json={
                "chat_id": settings.TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "Markdown",
            })
    except Exception as e:
        logger.error("Telegram notification failed: %s", e)


async def _send_ntfy(title: str, message: str, severity: str):
    try:
        priority_map = {"info": "default", "warning": "high", "error": "urgent", "critical": "max"}
        priority = priority_map.get(severity, "default")
        url = f"{settings.NTFY_URL.rstrip('/')}/{settings.NTFY_TOPIC}"
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                url,
                data=message.encode("utf-8"),
                headers={"Title": title, "Priority": priority, "Tags": f"robot,{severity}"},
            )
    except Exception as e:
        logger.error("ntfy notification failed: %s", e)
