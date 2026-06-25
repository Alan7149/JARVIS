"""
JARVIS Wake Word Listener
Uses Python SpeechRecognition + PyAudio to listen for "Hey JARVIS"
then captures and processes the command.
"""
import logging
import subprocess
import threading
import time
import tempfile
import os

import httpx

from core.config import settings

logger = logging.getLogger("jarvis.wake_word")

BACKEND_URL = "http://localhost:8000"
API_KEY = settings.API_KEY
# All the ways someone might say "Jarvis" — speech recognition isn't perfect
WAKE_WORDS = {
    "jarvis",           # plain "Jarvis"
    "hey jarvis",       # "Hey Jarvis"
    "okay jarvis",      # "Okay Jarvis"
    "hi jarvis",        # "Hi Jarvis"
    "yo jarvis",        # "Yo Jarvis"
    "jarvis please",    # polite
    "jarvis help",      # direct
    "ay jarvis",        # casual
    "a jarvis",         # misheard "Hey Jarvis"
    "hay jarvis",       # misheard
    "harris",           # common mishear
    "jarvis.",          # with punctuation
}

# How long to listen for a command after wake word (seconds)
COMMAND_LISTEN_TIMEOUT = 8
# Silence before stopping command recording (seconds)
PHRASE_TIMEOUT = 1.5

# Use shared global TTS lock — prevents double-voice with tts_tools.py
from core.tts_state import TTS_LOCK as _tts_lock, kill_current as _kill_current_tts, set_proc as _set_tts_proc
_tts_proc = None  # local ref still needed for wait()


def _speak(text: str):
    """
    Speak text — edge-tts (British male voice) with SAPI fallback.
    Uses a lock so only one voice plays at a time.
    """
    with _tts_lock:
        _kill_current_tts()
        _do_speak(text)


def _do_speak(text: str):
    """Internal: actually perform TTS (called inside lock)."""
    global _tts_proc
    safe_text = text.strip()[:500]

    # Try edge-tts — saves MP3, plays via PowerShell synchronously
    try:
        import asyncio
        import edge_tts

        # Run edge-tts in a fresh event loop (safe inside threads)
        loop = asyncio.new_event_loop()
        try:
            tmp = loop.run_until_complete(_edge_tts_save(safe_text))
        finally:
            loop.close()

        if tmp and os.path.exists(tmp):
            ps = (
                f"Add-Type -AssemblyName PresentationCore; "
                f"$p = New-Object System.Windows.Media.MediaPlayer; "
                f"$p.Open([Uri]::new('{tmp}')); "
                f"$p.Play(); "
                f"Start-Sleep -Milliseconds 500; "
                f"while ($p.NaturalDuration.HasTimeSpan -and "
                f"$p.Position -lt $p.NaturalDuration.TimeSpan) {{ Start-Sleep -Milliseconds 200 }}; "
                f"$p.Close(); "
                f"Remove-Item '{tmp}' -ErrorAction SilentlyContinue"
            )
            proc = subprocess.Popen(
                ["powershell", "-WindowStyle", "Hidden", "-Command", ps],
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            _set_tts_proc(proc)
            proc.wait()
            return
    except Exception as e:
        logger.debug("edge-tts failed (%s), using SAPI", e)

    # SAPI fallback — synchronous (wait=True via $s.Speak not $s.SpeakAsync)
    try:
        safe = safe_text.replace("'", "''").replace('"', '')
        try:
            from core.settings_store import get_tts_params
            gender = get_tts_params().get("gender", "Male")
        except Exception:
            gender = "Male"
        ps = (
            f"Add-Type -AssemblyName System.Speech; "
            f"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            f"$s.Rate = 1; "
            f"$s.SelectVoiceByHints('{gender}'); "
            f"$s.Speak('{safe}')"  # Speak (not SpeakAsync) — blocks until done
        )
        _tts_proc = subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command", ps],
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        _tts_proc.wait()
    except Exception as e:
        logger.error("SAPI speak failed: %s", e)


async def _edge_tts_save(text: str) -> str | None:
    """Save edge-tts audio to temp file and return path.

    Uses the voice/rate/pitch the user selected in Settings so wake-word and
    proactive announcements match the chosen voice (not a hard-coded default).
    """
    try:
        import edge_tts
        from core.settings_store import get_tts_params
        p = get_tts_params()
        tts = edge_tts.Communicate(text=text, voice=p["voice"], rate=p["rate"], pitch=p["pitch"])
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            tmp = f.name
        await tts.save(tmp)
        return tmp
    except Exception:
        return None


def _send_command(command: str) -> str:
    """Send command to JARVIS and return reply."""
    try:
        resp = httpx.post(
            f"{BACKEND_URL}/api/webhooks/phone",
            json={"device_name": "laptop-wake-word", "event_type": "voice_command", "command": command},
            headers={"X-API-Key": API_KEY},
            timeout=30,
        )
        return resp.json().get("response", "")
    except Exception as e:
        logger.error("Send command failed: %s", e)
        return ""


class WakeWordListener:
    def __init__(self):
        self.running = False
        self._thread: threading.Thread | None = None
        self._sr = None
        self._mic = None

    def _init_sr(self):
        import speech_recognition as sr
        self._sr = sr.Recognizer()
        self._sr.energy_threshold = 250        # lower = more sensitive
        self._sr.dynamic_energy_threshold = True
        self._sr.dynamic_energy_adjustment_damping = 0.15
        self._sr.dynamic_energy_ratio = 1.3    # how much louder than ambient
        self._sr.pause_threshold = PHRASE_TIMEOUT
        # Try default mic — if that fails, enumerate and pick first real input
        try:
            self._mic = sr.Microphone(device_index=None)
            # Test that it opens
            with self._mic as source:
                pass
        except Exception:
            # Fallback: pick first working input device
            for i, name in enumerate(sr.Microphone.list_microphone_names()):
                try:
                    test_mic = sr.Microphone(device_index=i)
                    with test_mic as source:
                        pass
                    self._mic = test_mic
                    logger.info("Using microphone [%d]: %s", i, name)
                    break
                except Exception:
                    continue
        # Calibrate
        logger.info("Calibrating microphone for ambient noise (2s)...")
        with self._mic as source:
            self._sr.adjust_for_ambient_noise(source, duration=2)
        logger.info("Microphone ready. Energy threshold: %.0f", self._sr.energy_threshold)

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="jarvis-wake-word")
        self._thread.start()
        logger.info("Wake word listener starting...")

    def stop(self):
        self.running = False
        logger.info("Wake word listener stopped")

    def _transcribe(self, audio) -> str:
        """Transcribe audio using Google (free) with Sphinx offline fallback."""
        import speech_recognition as sr
        # Try Google first (best accuracy)
        try:
            text = self._sr.recognize_google(audio, language="en-US")
            logger.debug("Google STT: %s", text)
            return text.lower().strip()
        except sr.UnknownValueError:
            return ""
        except sr.RequestError:
            # Offline fallback
            try:
                text = self._sr.recognize_sphinx(audio)
                logger.debug("Sphinx STT: %s", text)
                return text.lower().strip()
            except Exception:
                return ""
        except Exception as e:
            logger.debug("STT error: %s", e)
            return ""

    def _run(self):
        import speech_recognition as sr

        try:
            self._init_sr()
        except Exception as e:
            logger.error("Microphone init failed: %s", e)
            self.running = False
            return

        logger.info("Listening for 'Hey JARVIS'...")

        while self.running:
            try:
                # Listen for wake word
                with self._mic as source:
                    try:
                        audio = self._sr.listen(source, timeout=5, phrase_time_limit=6)
                    except sr.WaitTimeoutError:
                        continue

                text = self._transcribe(audio)
                if not text:
                    continue

                logger.debug("Heard: '%s'", text)

                # Check if any wake word is in the text
                # Also check for standalone "jarvis" anywhere in the sentence
                wake_detected = (
                    any(w in text for w in WAKE_WORDS) or
                    "jarvis" in text.split()  # standalone word
                )
                if not wake_detected:
                    continue

                logger.info("Wake word detected! Text: '%s'", text)

                # Extract command from same utterance (e.g. "Hey JARVIS what's the weather")
                command_part = text
                for w in sorted(WAKE_WORDS, key=len, reverse=True):
                    command_part = command_part.replace(w, "").strip(" ,.")

                if command_part and len(command_part) > 3:
                    # Command in same utterance — process directly (non-blocking so mic stays free)
                    logger.info("Command (inline): '%s'", command_part)
                    threading.Thread(target=self._handle_command, args=(command_part,), daemon=True).start()
                else:
                    # Wake word only — say "Yes?" then listen for command
                    _speak("Yes?")  # blocks until done (lock-protected)
                    logger.info("Waiting for command...")

                    with self._mic as source:
                        try:
                            audio = self._sr.listen(source, timeout=COMMAND_LISTEN_TIMEOUT, phrase_time_limit=10)
                            command = self._transcribe(audio)
                            if command and len(command) > 2:
                                logger.info("Command: '%s'", command)
                                # Handle in thread so mic loop can restart
                                threading.Thread(target=self._handle_command, args=(command,), daemon=True).start()
                            else:
                                _speak("I didn't catch that.")
                        except sr.WaitTimeoutError:
                            logger.debug("No command heard after wake word")

            except Exception as e:
                if self.running:
                    logger.error("Wake word loop error: %s", e)
                    time.sleep(1)

    def _handle_command(self, command: str):
        logger.info("Sending to JARVIS: '%s'", command)
        reply = _send_command(command)
        if reply:
            logger.info("JARVIS reply: %s", reply[:120])
            _speak(reply[:600])
        else:
            _speak("I'm sorry, I couldn't process that.")


# ── Singleton ─────────────────────────────────────────────────────────────────

_listener: WakeWordListener | None = None


def get_listener() -> WakeWordListener:
    global _listener
    if _listener is None:
        _listener = WakeWordListener()
    return _listener


def start_wake_word():
    get_listener().start()


def stop_wake_word():
    if _listener:
        _listener.stop()


# ── Standalone test ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    print("Starting wake word test. Say 'Hey JARVIS' to test.")
    print("Press Ctrl+C to stop.\n")
    listener = WakeWordListener()
    listener.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        listener.stop()
        print("\nStopped.")
