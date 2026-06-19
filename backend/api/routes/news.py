"""JARVIS News — on-demand tech & markets headlines for a country or satellite.

Backs the WAR ROOM detail panel: clicking a country fetches that country's
technology and stock-market news; clicking a satellite fetches news about that
satellite / its mission. Reuses the same web-search backend as the Intel feed,
with a short per-subject cache to stay within search rate limits.
"""
import asyncio
import logging
import time
from urllib.parse import urlparse

from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger("jarvis.news")

_cache: dict[str, tuple[float, dict]] = {}
_TTL = 900  # 15 min per subject
_sem = asyncio.Semaphore(2)  # be gentle with the search provider


async def _search(query: str, n: int = 5) -> list[dict]:
    try:
        from tools.search_tools import SearchTools
        async with _sem:
            r = await SearchTools.web_search(query, max_results=n)
            await asyncio.sleep(0.3)
        out = []
        for it in r.get("results", []):
            url = it.get("url", "") or ""
            try:
                src = urlparse(url).netloc.replace("www.", "") if url else ""
            except Exception:
                src = ""
            title = (it.get("title") or "").strip()
            if not title:
                continue
            out.append({
                "title": title,
                "snippet": (it.get("snippet") or "")[:200],
                "url": url,
                "source": src,
            })
        return out
    except Exception as e:
        logger.debug("news search failed for %r: %s", query, e)
        return []


_vid_cache: dict[str, tuple[float, dict]] = {}


def _yt_id(url: str) -> str:
    m = _RE_YT.search(url or "")
    return m.group(1) if m else ""


import re as _re
_RE_YT = _re.compile(r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})")


@router.get("/videos")
async def videos(q: str, n: int = 6):
    """Video results for a location/subject (for the WAR ROOM detail panel)."""
    q = (q or "").strip()
    if not q:
        return {"subject": q, "videos": []}
    key = f"vid:{q}".lower()
    now = time.time()
    if key in _vid_cache and now - _vid_cache[key][0] < _TTL:
        return _vid_cache[key][1]
    try:
        from tools.search_tools import SearchTools
        async with _sem:
            r = await SearchTools.video_search(f"{q} travel guide documentary", max_results=n)
            await asyncio.sleep(0.3)
        out = []
        for it in r.get("results", []):
            url = it.get("url", "") or ""
            title = (it.get("title") or "").strip()
            if not title or not url:
                continue
            vid = _yt_id(url)
            out.append({
                "title": title, "url": url,
                "video_id": vid,
                "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg" if vid else "",
            })
        data = {"subject": q, "videos": out}
    except Exception as e:
        logger.debug("video search failed for %r: %s", q, e)
        data = {"subject": q, "videos": []}
    _vid_cache[key] = (now, data)
    return data


@router.get("/news")
async def news(q: str, kind: str = "country"):
    """Return 2 sections of headlines for a subject (country or satellite)."""
    q = (q or "").strip()
    if not q:
        return {"subject": q, "kind": kind, "sections": []}

    key = f"{kind}:{q}".lower()
    now = time.time()
    if key in _cache and now - _cache[key][0] < _TTL:
        return _cache[key][1]

    if kind == "sat":
        queries = [("Latest", f"{q} satellite latest news"),
                   ("Space & Tech", f"{q} space technology news")]
    else:
        queries = [("Technology", f"{q} technology news"),
                   ("Markets & Stocks", f"{q} stock market news today")]

    results = await asyncio.gather(*[_search(query, 5) for _, query in queries])
    sections = [{"label": queries[i][0], "items": results[i][:5]} for i in range(len(queries))]
    data = {"subject": q, "kind": kind, "sections": sections,
            "empty": all(len(s["items"]) == 0 for s in sections)}
    _cache[key] = (now, data)
    return data
