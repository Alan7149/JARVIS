import logging
from datetime import datetime, timedelta, timezone

import httpx
import psutil
from sqlalchemy import select

from core.database import AsyncSessionLocal
from models.alert import Alert, AlertEvent
from monitoring.alert_state import get_state, set_state, is_snoozed

logger = logging.getLogger("jarvis.alert_checker")

REMINDER_INTERVAL = timedelta(hours=1)  # while still down, re-notify at most hourly


def _fmt_dur(start_iso: str | None, now: datetime) -> str:
    if not start_iso:
        return ""
    try:
        mins = int((now - datetime.fromisoformat(start_iso)).total_seconds() // 60)
    except Exception:
        return ""
    if mins >= 60:
        return f"{mins // 60}h {mins % 60}m"
    return f"{mins}m"


async def run_alert_checks():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Alert).where(Alert.is_active == True))
        alerts = result.scalars().all()

    for alert in alerts:
        try:
            await _check_alert(alert)
        except Exception as e:
            logger.error("Alert check failed for '%s': %s", alert.name, e)


async def _check_alert(alert: Alert):
    triggered = False
    message = ""

    cfg = alert.condition_config

    if alert.condition_type == "http_health":
        url = cfg.get("url")
        expected_status = cfg.get("expected_status", 200)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url)
            if r.status_code != expected_status:
                triggered = True
                message = f"{url} returned HTTP {r.status_code} (expected {expected_status})"
        except Exception as e:
            triggered = True
            message = f"{url} is unreachable: {e}"

    elif alert.condition_type == "disk_usage":
        mount = cfg.get("mount", "/")
        threshold = cfg.get("threshold_percent", 85)
        try:
            usage = psutil.disk_usage(mount)
            if usage.percent >= threshold:
                triggered = True
                message = f"Disk {mount} at {usage.percent:.1f}% (threshold: {threshold}%)"
        except Exception as e:
            logger.warning("Disk check failed: %s", e)

    elif alert.condition_type == "cpu_usage":
        threshold = cfg.get("threshold_percent", 90)
        cpu = psutil.cpu_percent(interval=1)
        if cpu >= threshold:
            triggered = True
            message = f"CPU at {cpu:.1f}% (threshold: {threshold}%)"

    elif alert.condition_type == "port_check":
        port = cfg.get("port")
        should_be_open = cfg.get("should_be_open", True)
        connections = psutil.net_connections(kind="inet")
        is_open = any(c.laddr.port == port for c in connections)
        if should_be_open and not is_open:
            triggered = True
            message = f"Port {port} is not listening (expected open)"
        elif not should_be_open and is_open:
            triggered = True
            message = f"Port {port} is unexpectedly open"

    elif alert.condition_type == "process_running":
        process_name = cfg.get("process_name", "")
        should_run = cfg.get("should_run", True)
        running = any(
            p.name().lower() == process_name.lower()
            for p in psutil.process_iter(["name"])
        )
        if should_run and not running:
            triggered = True
            message = f"Process '{process_name}' is not running"
        elif not should_run and running:
            triggered = True
            message = f"Process '{process_name}' is unexpectedly running"

    now = datetime.now(timezone.utc)
    st = get_state(alert.id)
    snoozed = is_snoozed(alert.id, now)

    async def emit(title: str, msg: str, severity: str):
        """Push a notification (unless snoozed) and always record the event."""
        try:
            from core.activity_log import log_event
            log_event("network", f"{alert.name}: {msg}", "success" if severity == "success" else "warning")
        except Exception:
            pass
        if not snoozed:
            from notifications.notifier import send_notification
            await send_notification(title=title, message=msg, severity=severity)
        async with AsyncSessionLocal() as db:
            db.add(AlertEvent(alert_id=alert.id, message=msg, severity=severity,
                              notified=not snoozed, created_at=now))
            ao = await db.get(Alert, alert.id)
            if ao and severity != "success":
                ao.last_triggered = now
            await db.commit()

    if triggered:
        if not st["triggered"]:
            # OK → DOWN: alert once
            st.update(triggered=True, down_since=now.isoformat(), last_notified=now.isoformat())
            await emit(f"JARVIS Alert: {alert.name}", message, "warning")
            logger.warning("Alert DOWN: %s — %s", alert.name, message)
        else:
            # Still down: re-notify at most once per hour (no more per-minute spam)
            last = st.get("last_notified")
            due = True
            if last:
                try:
                    due = (now - datetime.fromisoformat(last)) >= REMINDER_INTERVAL
                except Exception:
                    due = True
            if due:
                dur = _fmt_dur(st.get("down_since"), now)
                st["last_notified"] = now.isoformat()
                await emit(f"JARVIS Alert: {alert.name}",
                           f"{message}" + (f" — still down for {dur}" if dur else ""), "warning")
                logger.warning("Alert still down (hourly reminder): %s", alert.name)
            # else: stay silent
    else:
        if st["triggered"]:
            # DOWN → OK: recovery notice
            dur = _fmt_dur(st.get("down_since"), now)
            st.update(triggered=False, down_since=None, last_notified=None)
            await emit(f"JARVIS Recovered: {alert.name}",
                       f"✓ {alert.name} is back to normal" + (f" (was down {dur})" if dur else "") + ".",
                       "success")
            logger.info("Alert RECOVERED: %s", alert.name)
        # else: still OK — nothing to do

    set_state(alert.id, st)

    async with AsyncSessionLocal() as db:
        alert_obj = await db.get(Alert, alert.id)
        if alert_obj:
            alert_obj.last_checked = datetime.now(timezone.utc)
            await db.commit()
