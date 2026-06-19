import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("jarvis.scheduler")

_scheduler: AsyncIOScheduler | None = None


async def start_scheduler():
    global _scheduler
    _scheduler = AsyncIOScheduler()

    from monitoring.system_monitor import run_system_checks
    from monitoring.alert_checker import run_alert_checks
    from monitoring.daily_briefing import run_daily_briefing

    _scheduler.add_job(
        run_system_checks,
        IntervalTrigger(minutes=5),
        id="system_checks",
        replace_existing=True,
    )
    _scheduler.add_job(
        run_alert_checks,
        IntervalTrigger(minutes=1),
        id="alert_checks",
        replace_existing=True,
    )
    # Daily briefing at 9:00 AM local time
    _scheduler.add_job(
        run_daily_briefing,
        CronTrigger(hour=9, minute=0),
        id="daily_briefing",
        replace_existing=True,
    )

    # Twitter auto-poster — every 48 minutes, 30 posts/day
    from core.config import settings as _s
    if _s.TWITTER_AUTOPOSTER_ENABLED:
        from tools.twitter_autoposter import run_daily_twitter_session
        _scheduler.add_job(
            run_daily_twitter_session,
            IntervalTrigger(minutes=48),
            id="twitter_autoposter",
            replace_existing=True,
        )

    _scheduler.start()
    logger.info("Scheduler started")


async def stop_scheduler():
    if _scheduler and _scheduler.running:
        _scheduler.shutdown()
        logger.info("Scheduler stopped")


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler
