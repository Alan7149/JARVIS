"""JARVIS Intel Feed — Curated real-time world intelligence + videos."""
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger("jarvis.intel")

_cache = {"data": None, "fetched_at": None}
_refreshing = False
CACHE_MINUTES = 30

# More categories → more news
TECH_QUERIES = [
    "latest AI news today",
    "software engineering trends 2025",
    "tech startup news today",
    "new programming tools released",
]
TRENDING_QUERIES = [
    "India tech news today",
    "developer tools trending",
    "programming news this week",
    "cybersecurity news today",
]
COMPETITOR_QUERIES = []  # user can add via settings
VIDEO_QUERIES = [
    "AI technology explained 2025",
    "software engineering tutorial latest",
    "tech news weekly recap",
]


# Limit concurrent DuckDuckGo calls — bursts get rate-limited
_search_sem = asyncio.Semaphore(2)


async def _search(query: str, n: int = 5) -> list:
    try:
        from tools.search_tools import SearchTools
        async with _search_sem:
            r = await SearchTools.web_search(query, max_results=n)
            await asyncio.sleep(0.4)  # gentle spacing to avoid rate limit
        return r.get("results", [])
    except Exception:
        return []


async def _video_search(query: str, n: int = 4) -> list:
    try:
        from tools.search_tools import SearchTools
        async with _search_sem:
            r = await SearchTools.video_search(query, max_results=n)
            await asyncio.sleep(0.4)
        return r.get("results", [])
    except Exception:
        return []


def _dedupe(items: list, key: str = "title") -> list:
    seen, out = set(), []
    for it in items:
        k = (it.get(key) or "").strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(it)
    return out


async def _ai_summary(items: list) -> str:
    try:
        from core.config import settings
        from groq import AsyncGroq
        texts = "\n".join(f"- {i.get('title','')}. {i.get('snippet','')[:80]}" for i in items[:12])
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        resp = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content":
                f"From these tech/world news items, write exactly 3 concise bullet points "
                f"(start each with •) that matter most to a developer/entrepreneur today. "
                f"Be specific and punchy. Do NOT add a preamble.\n\n{texts}"}],
            max_tokens=220,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f"• Intelligence summary temporarily unavailable."


async def _build_feed():
    now = datetime.now(timezone.utc)

    tech_results, trending_results, video_results = await asyncio.gather(
        asyncio.gather(*[_search(q) for q in TECH_QUERIES], return_exceptions=True),
        asyncio.gather(*[_search(q) for q in TRENDING_QUERIES], return_exceptions=True),
        asyncio.gather(*[_video_search(q) for q in VIDEO_QUERIES], return_exceptions=True),
        return_exceptions=True,
    )

    def _flatten(groups):
        out = []
        if isinstance(groups, Exception):
            return out
        for sub in groups:
            if isinstance(sub, list):
                out.extend(sub)
        return out

    tech = _dedupe(_flatten(tech_results))[:12]
    trend = _dedupe(_flatten(trending_results))[:12]
    videos = _dedupe(_flatten(video_results))[:9]

    # Competitor intel (only if user added competitors)
    competitor = []
    if COMPETITOR_QUERIES:
        comp_results = await asyncio.gather(*[_search(q) for q in COMPETITOR_QUERIES], return_exceptions=True)
        competitor = _dedupe(_flatten(comp_results))[:8]

    summary = await _ai_summary(tech + trend)

    return {
        "timestamp": now.isoformat(),
        "summary": summary,
        "tech_news": tech,
        "trending": trend,
        "videos": videos,
        "competitor_intel": competitor,
        "fetched_at": now.isoformat(),
        "next_refresh_mins": CACHE_MINUTES,
        "counts": {"tech": len(tech), "trending": len(trend), "videos": len(videos)},
    }


@router.get("/intel/feed")
async def intel_feed(force_refresh: bool = False):
    """Curated intelligence feed — served from cache, refreshes in background."""
    global _cache, _refreshing
    now = datetime.now(timezone.utc)

    if not force_refresh and _cache["data"] and _cache["fetched_at"]:
        age = (now - _cache["fetched_at"]).total_seconds() / 60
        if age < CACHE_MINUTES:
            return {**_cache["data"], "cached": True, "age_mins": round(age, 1)}
        # Stale → return immediately, refresh in background
        if not _refreshing:
            async def _bg():
                global _cache, _refreshing
                _refreshing = True
                try:
                    data = await _build_feed()
                    _cache = {"data": data, "fetched_at": datetime.now(timezone.utc)}
                finally:
                    _refreshing = False
            asyncio.create_task(_bg())
        return {**_cache["data"], "cached": True, "age_mins": round(age, 1), "refreshing": True}

    data = await _build_feed()
    _cache = {"data": data, "fetched_at": now}
    return {**data, "cached": False}


@router.post("/intel/add-topic")
async def add_topic(payload: dict):
    """Add a custom topic to track (also used for competitor tracking)."""
    topic = payload.get("topic", "").strip()
    kind = payload.get("kind", "tech")  # tech | competitor
    if topic:
        if kind == "competitor":
            COMPETITOR_QUERIES.append(topic)
        else:
            TECH_QUERIES.append(topic)
        _cache["data"] = None  # invalidate
    return {"added": topic, "kind": kind}


async def prewarm():
    """Build the feed once at startup so the first page load is instant."""
    global _cache
    try:
        data = await _build_feed()
        _cache = {"data": data, "fetched_at": datetime.now(timezone.utc)}
        logger.info("Intel feed pre-warmed: %s", data.get("counts"))
    except Exception as e:
        logger.warning("Intel prewarm failed: %s", e)
