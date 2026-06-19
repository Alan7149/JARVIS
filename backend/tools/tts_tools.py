"""Text-to-Speech tools — JARVIS speaks back."""
import asyncio
import logging
import os
import tempfile
from typing import Any

logger = logging.getLogger("jarvis.tools.tts")

# JARVIS voice — Microsoft Edge TTS (free, high quality)
JARVIS_VOICE = "en-GB-RyanNeural"   # British male — most JARVIS-like
JARVIS_RATE = "+0%"
JARVIS_PITCH = "-5Hz"


async def _notify_speaking(state: bool):
    """Broadcast speaking state to dashboard/OBS overlay via WebSocket."""
    try:
        from core.websocket_manager import ws_manager
        await ws_manager.broadcast("jarvis_speaking", {"speaking": state})
    except Exception:
        pass


async def speak_text(text: str, voice: str | None = None) -> dict[str, Any]:
    """Speak text aloud using Edge TTS. Uses shared lock to prevent double-voice.

    When `voice` is not given, the voice/rate/pitch the user selected in
    Settings are used (via settings_store.get_tts_params) instead of the
    hard-coded default — so changing the voice in Settings actually takes effect.
    """
    from core.tts_state import TTS_LOCK, kill_current, set_proc
    from core.settings_store import get_tts_params
    params = get_tts_params()
    voice = voice or params["voice"]
    rate = params["rate"]
    pitch = params["pitch"]
    # Kill anything currently speaking before starting
    kill_current()
    await _notify_speaking(True)
    try:
        import edge_tts
        import subprocess

        tts = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            tmp_path = f.name

        await tts.save(tmp_path)

        # Play on Windows — single MediaPlayer instance that waits for the clip
        # to finish, then cleans up the temp file.
        if os.name == "nt":
            ps_script = f"""
Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([Uri]::new('{tmp_path}'))
$player.Play()
Start-Sleep -Milliseconds 400
while ($player.NaturalDuration.HasTimeSpan -and $player.Position -lt $player.NaturalDuration.TimeSpan) {{ Start-Sleep -Milliseconds 200 }}
$player.Close()
Remove-Item '{tmp_path}' -ErrorAction SilentlyContinue
"""
            proc = subprocess.Popen(
                ["powershell", "-WindowStyle", "Hidden", "-Command", ps_script],
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            set_proc(proc)

        await _notify_speaking(False)
        return {"spoken": True, "text": text, "voice": voice}
    except ImportError:
        result = await _speak_sapi(text)
        await _notify_speaking(False)
        return result
    except Exception as e:
        logger.error("TTS failed: %s", e)
        result = await _speak_sapi(text)
        await _notify_speaking(False)
        return result


async def _speak_sapi(text: str) -> dict[str, Any]:
    """Fallback TTS using Windows built-in SAPI."""
    try:
        import subprocess
        from core.settings_store import get_tts_params
        gender = get_tts_params().get("gender", "Male")
        # Escape single quotes in text
        safe_text = text.replace("'", "''")
        ps = f"Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoiceByHints('{gender}'); $s.Speak('{safe_text}')"
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command", ps],
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return {"spoken": True, "text": text, "voice": "windows-sapi"}
    except Exception as e:
        return {"spoken": False, "error": str(e)}


async def get_available_voices() -> dict[str, Any]:
    """List available Edge TTS voices."""
    try:
        import edge_tts
        voices = await edge_tts.list_voices()
        english = [v for v in voices if v["Locale"].startswith("en")]
        return {
            "voices": [
                {"name": v["ShortName"], "gender": v["Gender"], "locale": v["Locale"]}
                for v in english
            ]
        }
    except Exception as e:
        return {"error": str(e)}
