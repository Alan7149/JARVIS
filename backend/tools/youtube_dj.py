"""
JARVIS YouTube Music DJ
Controls YouTube Music playback based on context (coding, gaming, chilling).
Uses ytmusicapi for search + webbrowser to open.
"""
import logging
import subprocess
import webbrowser
from typing import Any

logger = logging.getLogger("jarvis.dj")

CONTEXT_PLAYLISTS = {
    "coding":      "lofi hip hop beats to code to",
    "gaming":      "epic gaming music intense",
    "focus":       "deep focus music concentration",
    "watching":    "chill vibes playlist",
    "meeting":     None,  # mute during meetings
    "presenting":  None,
    "idle":        "ambient background music",
    "chilling":    "chill acoustic playlist",
    "designing":   "creative flow music design",
    "writing":     "classical music writing focus",
}


class YoutubeDJ:

    @staticmethod
    async def search_and_play(query: str) -> dict[str, Any]:
        """Search YouTube Music and open the first result."""
        try:
            from ytmusicapi import YTMusic
            yt = YTMusic()
            results = yt.search(query, filter="songs", limit=3)
            if not results:
                results = yt.search(query, limit=3)
            if results:
                video_id = results[0].get("videoId")
                title = results[0].get("title", query)
                artist = ""
                if results[0].get("artists"):
                    artist = results[0]["artists"][0].get("name", "")
                if video_id:
                    url = f"https://music.youtube.com/watch?v={video_id}"
                    webbrowser.open(url)
                    logger.info("Playing: %s — %s", title, artist)
                    return {"playing": True, "title": title, "artist": artist, "url": url}
        except Exception as e:
            logger.warning("ytmusicapi failed (%s), using search fallback", e)

        # Fallback: open YouTube Music search
        import urllib.parse
        url = f"https://music.youtube.com/search?q={urllib.parse.quote(query)}"
        webbrowser.open(url)
        return {"playing": True, "query": query, "url": url}

    @staticmethod
    async def play_for_context(context: str) -> dict[str, Any]:
        """Auto-play music based on current JARVIS context."""
        playlist = CONTEXT_PLAYLISTS.get(context)
        if not playlist:
            return {"skipped": True, "reason": f"No music for context: {context}"}
        return await YoutubeDJ.search_and_play(playlist)

    @staticmethod
    async def pause() -> dict[str, Any]:
        """Pause media via keyboard shortcut."""
        try:
            subprocess.run(
                ["powershell", "-Command",
                 "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]179)"],
                creationflags=subprocess.CREATE_NO_WINDOW, check=False
            )
            return {"paused": True}
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    async def next_track() -> dict[str, Any]:
        """Skip to next track via keyboard shortcut."""
        try:
            subprocess.run(
                ["powershell", "-Command",
                 "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]176)"],
                creationflags=subprocess.CREATE_NO_WINDOW, check=False
            )
            return {"skipped": True}
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    async def set_volume(level: int) -> dict[str, Any]:
        """Set system volume 0-100."""
        try:
            ps = f"$obj = New-Object -ComObject WScript.Shell; (New-Object -ComObject Shell.Application).SetMinFade(); [audio]::Volume = {level/100}"
            subprocess.run(["powershell", "-Command", ps],
                           creationflags=subprocess.CREATE_NO_WINDOW, check=False)
            return {"volume": level}
        except Exception as e:
            return {"error": str(e)}
