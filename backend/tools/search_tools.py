"""Web search tool using DuckDuckGo (free, no API key)."""
import asyncio
import logging
from typing import Any

logger = logging.getLogger("jarvis.tools.search")


def _get_ddgs():
    """Return DDGS class, supporting both new and old package names."""
    try:
        from ddgs import DDGS
    except ImportError:
        from duckduckgo_search import DDGS
    return DDGS


def _ddg_search_sync(query: str, max_results: int) -> list[dict]:
    """Blocking DuckDuckGo text search — must run in an executor."""
    results = []
    try:
        DDGS = _get_ddgs()
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", "") or r.get("url", ""),
                    "snippet": r.get("body", "") or r.get("snippet", ""),
                })
    except Exception as e:
        logger.error("DDG search failed for '%s': %s", query, e)
    return results


def _ddg_video_sync(query: str, max_results: int) -> list[dict]:
    """Blocking DuckDuckGo video search — must run in an executor."""
    results = []
    try:
        DDGS = _get_ddgs()
        with DDGS() as ddgs:
            for r in ddgs.videos(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("content", "") or r.get("url", ""),
                    "thumbnail": (r.get("images", {}) or {}).get("medium", "")
                                 or (r.get("images", {}) or {}).get("large", ""),
                    "duration": r.get("duration", ""),
                    "publisher": r.get("publisher", "") or r.get("uploader", ""),
                    "views": r.get("statistics", {}).get("viewCount") if isinstance(r.get("statistics"), dict) else None,
                })
    except Exception as e:
        logger.error("DDG video search failed for '%s': %s", query, e)
    return results


class SearchTools:

    @staticmethod
    async def web_search(query: str, max_results: int = 6) -> dict[str, Any]:
        try:
            loop = asyncio.get_event_loop()
            results = await asyncio.wait_for(
                loop.run_in_executor(None, _ddg_search_sync, query, max_results),
                timeout=8.0,
            )
            return {"query": query, "results": results, "count": len(results)}
        except Exception as e:
            logger.error("Web search failed: %s", e)
            return {"error": str(e), "query": query, "results": []}

    @staticmethod
    async def video_search(query: str, max_results: int = 6) -> dict[str, Any]:
        try:
            loop = asyncio.get_event_loop()
            results = await asyncio.wait_for(
                loop.run_in_executor(None, _ddg_video_sync, query, max_results),
                timeout=8.0,
            )
            return {"query": query, "results": results, "count": len(results)}
        except Exception as e:
            logger.error("Video search failed: %s", e)
            return {"error": str(e), "query": query, "results": []}

    @staticmethod
    async def get_weather(location: str = "auto") -> dict[str, Any]:
        """Get current weather using Open-Meteo (free, no API key)."""
        import httpx
        try:
            # Get coordinates from location or IP
            if location == "auto":
                async with httpx.AsyncClient(timeout=10) as client:
                    geo = await client.get("https://ipapi.co/json/")
                    geo_data = geo.json()
                    lat = geo_data.get("latitude", 28.6)
                    lon = geo_data.get("longitude", 77.2)
                    city = geo_data.get("city", "Unknown")
                    country = geo_data.get("country_name", "")
            else:
                # Geocode city name
                async with httpx.AsyncClient(timeout=10) as client:
                    geo = await client.get(
                        "https://geocoding-api.open-meteo.com/v1/search",
                        params={"name": location, "count": 1}
                    )
                    results = geo.json().get("results", [])
                    if not results:
                        return {"error": f"Location '{location}' not found"}
                    lat = results[0]["latitude"]
                    lon = results[0]["longitude"]
                    city = results[0].get("name", location)
                    country = results[0].get("country", "")

            # Fetch weather
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": lat, "longitude": lon,
                        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
                        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code",
                        "timezone": "auto",
                        "forecast_days": 5,
                    }
                )
                data = resp.json()

            current = data.get("current", {})
            daily = data.get("daily", {})

            wmo_codes = {
                0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
                45: "Foggy", 51: "Light drizzle", 61: "Light rain", 63: "Moderate rain",
                65: "Heavy rain", 71: "Light snow", 80: "Rain showers", 95: "Thunderstorm",
            }
            code = current.get("weather_code", 0)
            description = wmo_codes.get(code, f"Code {code}")

            forecast = []
            if daily.get("time"):
                for i in range(min(5, len(daily["time"]))):
                    forecast.append({
                        "date": daily["time"][i],
                        "max": daily["temperature_2m_max"][i],
                        "min": daily["temperature_2m_min"][i],
                        "description": wmo_codes.get(daily["weather_code"][i], ""),
                    })

            return {
                "location": f"{city}, {country}",
                "temperature_c": current.get("temperature_2m"),
                "feels_like_c": current.get("apparent_temperature"),
                "humidity": current.get("relative_humidity_2m"),
                "wind_speed_kmh": current.get("wind_speed_10m"),
                "description": description,
                "precipitation_mm": current.get("precipitation", 0),
                "forecast_5day": forecast,
            }
        except Exception as e:
            logger.error("Weather fetch failed: %s", e)
            return {"error": str(e)}
