"""Daily briefing automation — runs every morning at 9 AM."""
import logging
from datetime import datetime, timezone

logger = logging.getLogger("jarvis.briefing")


async def run_daily_briefing():
    """Compose and deliver the morning briefing."""
    logger.info("Running daily briefing...")
    try:
        from core.config import settings
        from core.websocket_manager import ws_manager
        from tools.search_tools import SearchTools

        parts = []
        now = datetime.now()
        parts.append(f"Good morning. Today is {now.strftime('%A, %B %d, %Y')}.")

        # Weather
        try:
            weather = await SearchTools.get_weather("auto")
            if "temperature_c" in weather:
                parts.append(
                    f"Current weather in {weather.get('location', 'your area')}: "
                    f"{weather['temperature_c']:.0f}°C, {weather.get('description', '')}. "
                    f"Wind {weather.get('wind_speed_kmh', 0):.0f} km/h."
                )
                forecast = weather.get("forecast_5day", [])
                if len(forecast) >= 2:
                    tomorrow = forecast[1]
                    parts.append(
                        f"Tomorrow: high of {tomorrow['max']:.0f}°C, {tomorrow['description']}."
                    )
        except Exception as e:
            logger.warning("Weather fetch failed: %s", e)

        # Google Calendar (optional)
        try:
            from tools.calendar_tools import CalendarTools
            calendar = await CalendarTools.get_calendar_events(days_ahead=1, max_results=5)
            events = calendar.get("events", [])
            if events:
                parts.append(f"You have {len(events)} event(s) today:")
                for e in events[:3]:
                    start = e.get("start", "")
                    if "T" in start:
                        time_str = datetime.fromisoformat(start.replace("Z", "+00:00")).strftime("%H:%M")
                    else:
                        time_str = "All day"
                    parts.append(f"  · {time_str} — {e.get('title', 'Untitled')}")
        except Exception:
            pass

        # Gmail unread count (optional)
        try:
            from tools.calendar_tools import CalendarTools
            gmail = await CalendarTools.get_gmail_inbox(max_results=20, query="is:unread")
            count = gmail.get("count", 0)
            if count:
                parts.append(f"You have {count} unread email{'s' if count != 1 else ''} in Gmail.")
        except Exception:
            pass

        # System status
        try:
            from tools.system_tools import SystemTools
            status = await SystemTools.get_system_status()
            cpu = status.get("cpu_percent", 0)
            ram = status.get("ram_percent", 0)
            if cpu > 70 or ram > 80:
                parts.append(f"System alert: CPU at {cpu:.0f}%, RAM at {ram:.0f}%.")
            else:
                parts.append(f"All systems nominal. CPU {cpu:.0f}%, RAM {ram:.0f}%.")
        except Exception:
            pass

        briefing_text = " ".join(parts)
        logger.info("Briefing: %s", briefing_text[:200])

        # 1. Broadcast to WebSocket (shows in dashboard)
        await ws_manager.broadcast("daily_briefing", {
            "text": briefing_text,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "parts": parts,
        })

        # 2. Speak aloud on the laptop
        try:
            from tools.tts_tools import speak_text
            await speak_text(briefing_text[:500])
        except Exception as e:
            logger.warning("TTS failed: %s", e)

        # 3. Push notification to phone
        try:
            if settings.NTFY_URL and settings.NTFY_PUSH_TOPIC:
                import httpx
                summary = " | ".join(parts[:3])
                url = f"{settings.NTFY_URL.rstrip('/')}/{settings.NTFY_PUSH_TOPIC}"
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(url, data=summary.encode(),
                                      headers={"Title": "☀️ JARVIS Morning Briefing",
                                               "Priority": "default", "Tags": "sun"})
        except Exception as e:
            logger.warning("Push notification failed: %s", e)

        logger.info("Daily briefing delivered.")

    except Exception as e:
        logger.error("Daily briefing failed: %s", e)
