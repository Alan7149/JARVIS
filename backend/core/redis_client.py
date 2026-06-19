import logging
import redis.asyncio as redis
from core.config import settings

logger = logging.getLogger("jarvis.redis")
_redis: redis.Redis | None = None


async def init_redis():
    global _redis
    if not settings.REDIS_URL:
        logger.info("Redis URL not configured — running without Redis cache")
        return
    try:
        _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis.ping()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning(f"Redis unavailable ({e}) — running without cache")
        _redis = None


def get_redis() -> redis.Redis | None:
    return _redis
