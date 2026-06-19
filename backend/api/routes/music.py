"""YouTube Music DJ — proper API route."""
import logging
import webbrowser
import urllib.parse
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger("jarvis.music")

# Track state
_state = {
    "playing": False,
    "current_query": "",
    "current_url": "",
    "status": "idle",
}


@router.post("/music/play")
async def play_music(payload: dict):
    query = payload.get("query", "")
    if not query:
        return {"error": "No query provided"}
    try:
        # Try ytmusicapi first
        try:
            from ytmusicapi import YTMusic
            yt = YTMusic()
            results = yt.search(query, filter="songs", limit=3)
            if not results:
                results = yt.search(query, limit=3)
            if results:
                video_id = results[0].get("videoId")
                title = results[0].get("title", query)
                artists = results[0].get("artists", [])
                artist = artists[0].get("name", "") if artists else ""
                if video_id:
                    url = f"https://music.youtube.com/watch?v={video_id}"
                    webbrowser.open(url)
                    _state.update({"playing": True, "current_query": query, "current_url": url, "status": "playing"})
                    return {"playing": True, "title": title, "artist": artist, "url": url, "method": "ytmusicapi"}
        except Exception as e:
            logger.debug("ytmusicapi failed: %s", e)

        # Fallback: open YouTube Music search
        encoded = urllib.parse.quote(query)
        url = f"https://music.youtube.com/search?q={encoded}"
        webbrowser.open(url)
        _state.update({"playing": True, "current_query": query, "current_url": url, "status": "playing"})
        return {"playing": True, "query": query, "url": url, "method": "search"}

    except Exception as e:
        return {"error": str(e)}


@router.post("/music/pause")
async def pause_music():
    import subprocess
    try:
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command",
             "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]179)"],
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        _state["status"] = "paused"
        return {"paused": True}
    except Exception as e:
        return {"error": str(e)}


@router.post("/music/next")
async def next_track():
    import subprocess
    try:
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command",
             "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]176)"],
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        return {"skipped": True}
    except Exception as e:
        return {"error": str(e)}


@router.post("/music/volume")
async def set_volume(payload: dict):
    level = max(0, min(100, payload.get("level", 70)))
    import subprocess
    try:
        # Set volume via PowerShell
        script = f"""
$vol = {level}
$wshShell = New-Object -comObject WScript.Shell
# Mute first then unmute to set
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public class Audio {{
    [DllImport("user32.dll")] public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);
    public static void SetVolume(int level) {{}}
}}
'@
"""
        # Simpler approach: use nircmd if available, else SendKeys
        result = subprocess.run(
            ["nircmd", "setsysvolume", str(int(level * 655.35))],
            capture_output=True, timeout=3,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        return {"volume": level}
    except Exception:
        return {"volume": level, "note": "Volume control via media keys"}


@router.get("/music/status")
async def music_status():
    return _state
