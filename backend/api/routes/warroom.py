"""JARVIS War Room — geolocated connections plotted for the holographic globe.

Reuses the Threat Matrix scan (which already geolocates live network
connections via ip-api) and adds the user's own "home" location so the
frontend can draw flight-path arcs from home to every endpoint.
"""
import logging
import time

from fastapi import APIRouter

from api.routes.threat_matrix import threat_matrix, _geoip

router = APIRouter()
logger = logging.getLogger("jarvis.warroom")

_home = {"data": None, "ts": 0}
_HOME_TTL = 1800  # public IP / location rarely changes — cache 30 min


async def _home_geo() -> dict:
    """Geolocate this machine's public IP (ip-api echoes the caller's IP)."""
    now = time.time()
    if _home["data"] and now - _home["ts"] < _HOME_TTL:
        return _home["data"]
    try:
        import httpx
        r = await httpx.AsyncClient(timeout=4).get(
            "http://ip-api.com/json/?fields=country,countryCode,city,lat,lon,isp,query"
        )
        d = r.json()
        home = {
            "lat": d.get("lat", 0.0), "lon": d.get("lon", 0.0),
            "city": d.get("city", "Home"), "country": d.get("country", ""),
            "ip": d.get("query", ""), "isp": d.get("isp", ""),
        }
    except Exception:
        home = {"lat": 0.0, "lon": 0.0, "city": "Home", "country": "", "ip": "", "isp": ""}
    _home["data"] = home
    _home["ts"] = now
    return home


@router.get("/warroom")
async def warroom():
    """Globe data: home node + geolocated connection nodes + threat score."""
    matrix = await threat_matrix()
    home = await _home_geo()

    nodes = []
    for c in matrix.get("connections", []):
        lat, lon = c.get("lat", 0), c.get("lon", 0)
        # Skip endpoints we couldn't geolocate (0,0 == null island)
        if not lat and not lon:
            continue
        severity = "critical" if c.get("suspicious") else "normal"
        nodes.append({
            "lat": lat, "lon": lon,
            "city": c.get("city", ""), "country": c.get("country", "?"),
            "country_code": c.get("country_code", "??"),
            "ip": c.get("ip", ""), "port": c.get("port", 0),
            "process": c.get("process", "?"), "isp": c.get("isp", ""),
            "severity": severity,
        })

    return {
        "home": home,
        "nodes": nodes,
        "threat_score": matrix.get("threat_score", 0),
        "total_connections": matrix.get("total_connections", len(nodes)),
        "alerts": matrix.get("alerts", []),
        "timestamp": matrix.get("timestamp"),
    }


# ── Real satellites (Celestrak TLE proxy) ────────────────────────────────────
_sats = {"data": None, "ts": 0}
_SATS_TTL = 7200  # TLEs change slowly — cache 2h

# Curated groups (small ones in full; big constellations are sliced client-side)
_SAT_GROUPS = [
    ("stations", "LEO", "#00ff88"),
    ("science", "LEO", "#00d4ff"),
    ("gps-ops", "MEO", "#00ff88"),
    ("galileo", "MEO", "#00d4ff"),
    ("geo", "GEO", "#ff3333"),
    ("starlink", "LEO", "#a855f7"),
]
_SAT_META = {
    "ISS (ZARYA)": ("NASA / Roscosmos / partners", "Crewed orbital laboratory — circles Earth every ~92 min."),
    "CSS (TIANHE)": ("CMSA (China)", "China’s crewed modular space station."),
    "HST": ("NASA / ESA", "Hubble Space Telescope — optical/UV observatory since 1990."),
}


async def _fetch_tle(group: str, limit: int) -> list[dict]:
    import httpx
    url = f"https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle"
    try:
        async with httpx.AsyncClient(timeout=8) as cli:
            r = await cli.get(url)
        lines = [ln.rstrip() for ln in r.text.splitlines() if ln.strip()]
        out = []
        for i in range(0, len(lines) - 2, 3):
            name, l1, l2 = lines[i].strip(), lines[i + 1], lines[i + 2]
            if not l1.startswith("1 ") or not l2.startswith("2 "):
                continue
            out.append({"name": name, "line1": l1, "line2": l2})
            if len(out) >= limit:
                break
        return out
    except Exception as e:
        logger.debug("TLE fetch failed for %s: %s", group, e)
        return []


@router.get("/satellites")
async def satellites():
    """Real satellite elements (TLE) from Celestrak, cached. Frontend propagates
    them with satellite.js to show where each satellite actually is right now."""
    now = time.time()
    if _sats["data"] and now - _sats["ts"] < _SATS_TTL:
        return _sats["data"]
    import asyncio
    # small groups in full; huge constellations sliced to a representative sample
    limits = {"stations": 8, "science": 12, "gps-ops": 31, "galileo": 28, "geo": 25, "starlink": 30}
    results = await asyncio.gather(*[_fetch_tle(g, limits.get(g, 20)) for g, _, _ in _SAT_GROUPS])
    sats = []
    for (group, kind, color), items in zip(_SAT_GROUPS, results):
        for it in items:
            meta = _SAT_META.get(it["name"], (group.replace("-", " ").title(), f"{kind} satellite ({group})."))
            sats.append({**it, "kind": kind, "color": color, "operator": meta[0], "purpose": meta[1], "group": group})
    data = {"satellites": sats, "count": len(sats), "ts": now}
    if sats:
        _sats["data"] = data
        _sats["ts"] = now
    return data


# ── Submarine cable layer (TeleGeography proxy, downsampled) ──────────────────
_cables = {"data": None, "ts": 0}
_CABLES_TTL = 86400  # cables change rarely — cache 24h


@router.get("/warroom/cables")
async def cables():
    """Real submarine internet cables (TeleGeography), downsampled to stay light."""
    now = time.time()
    if _cables["data"] and now - _cables["ts"] < _CABLES_TTL:
        return _cables["data"]
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15) as cli:
            r = await cli.get("https://www.submarinecablemap.com/api/v3/cable/cable-geo.json")
        gj = r.json()
    except Exception as e:
        logger.debug("cable fetch failed: %s", e)
        return {"cables": [], "count": 0}

    out = []
    for feat in gj.get("features", []):
        props = feat.get("properties", {}) or {}
        geom = feat.get("geometry", {}) or {}
        coords = geom.get("coordinates", [])
        if geom.get("type") == "LineString":
            coords = [coords]
        lines = []
        for seg in coords:
            # downsample: keep every 3rd point + endpoints
            pts = [seg[k] for k in range(0, len(seg), 3)]
            if seg and seg[-1] not in pts:
                pts.append(seg[-1])
            if len(pts) >= 2:
                lines.append([[round(p[0], 2), round(p[1], 2)] for p in pts])
        if lines:
            out.append({"name": props.get("name", ""), "color": props.get("color", "#00d4ff"), "lines": lines})
    data = {"cables": out, "count": len(out)}
    if out:
        _cables["data"] = data
        _cables["ts"] = now
    return data
