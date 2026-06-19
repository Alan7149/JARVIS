"""
JARVIS Wake Word Listener
Listens for "hey jarvis" or "jarvis" then records voice and sends to JARVIS.

Requirements:
    pip install openwakeword pyaudio faster-whisper httpx sounddevice numpy

Usage:
    python -m voice.wake_word_listener
"""

import asyncio
import io
import logging
import struct
import sys
import threading
import time
import wave
from pathlib import Path

import httpx
import numpy as np

logger = logging.getLogger("jarvis.voice")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

SAMPLE_RATE = 16000
CHUNK_SIZE = 1280          # 80ms at 16kHz
SILENCE_THRESHOLD = 500    # RMS threshold
SILENCE_DURATION = 1.5     # seconds of silence to stop recording
MAX_RECORD_SECONDS = 30
JARVIS_URL = "http://localhost:8000"


class VoiceAssistant:
    def __init__(self):
        self._oww_model = None
        self._whisper_model = None
        self._active = False
        self._conversation_id = None

    def _load_models(self):
        logger.info("Loading wake word model...")
        try:
            from openwakeword.model import Model
            self._oww_model = Model(wakeword_models=["hey_jarvis"], inference_framework="onnx")
            logger.info("Wake word model loaded: hey_jarvis")
        except Exception as e:
            logger.warning("openwakeword not available: %s — using keyword detection fallback", e)

        logger.info("Loading Whisper model...")
        try:
            from faster_whisper import WhisperModel
            self._whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
            logger.info("Whisper loaded")
        except Exception as e:
            logger.error("faster-whisper not available: %s", e)

    def _rms(self, data: bytes) -> float:
        shorts = struct.unpack(f"{len(data) // 2}h", data)
        return (sum(s * s for s in shorts) / len(shorts)) ** 0.5

    def _record_after_wake(self, stream) -> bytes | None:
        logger.info("Wake word detected! Listening for command...")
        self._play_activation_sound()

        frames = []
        silence_start = None
        start_time = time.time()

        while True:
            if time.time() - start_time > MAX_RECORD_SECONDS:
                break

            data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
            frames.append(data)

            rms = self._rms(data)
            if rms < SILENCE_THRESHOLD:
                if silence_start is None:
                    silence_start = time.time()
                elif time.time() - silence_start >= SILENCE_DURATION:
                    logger.info("Silence detected — processing command")
                    break
            else:
                silence_start = None

        if not frames:
            return None

        # Write to WAV buffer
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(b"".join(frames))
        return buf.getvalue()

    def _transcribe(self, audio_bytes: bytes) -> str:
        if not self._whisper_model:
            return ""
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            segments, _ = self._whisper_model.transcribe(tmp_path, beam_size=3, language="en")
            text = " ".join(s.text for s in segments).strip()
            return text
        finally:
            os.unlink(tmp_path)

    def _send_to_jarvis(self, text: str):
        if not text:
            return
        logger.info("Command: %s", text)
        try:
            payload = {"message": text}
            if self._conversation_id:
                payload["conversation_id"] = self._conversation_id

            response_text = ""
            with httpx.stream(
                "POST",
                f"{JARVIS_URL}/api/agent/chat",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=60,
            ) as response:
                import json as _json
                for line in response.iter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        try:
                            event = _json.loads(line[6:])
                            if event.get("type") == "conversation_id":
                                self._conversation_id = event["data"]
                            elif event.get("type") == "text":
                                response_text += event["data"]
                                print(event["data"], end="", flush=True)
                        except Exception:
                            pass

            print()
            if response_text:
                self._speak(response_text)
        except Exception as e:
            logger.error("Error sending to JARVIS: %s", e)

    def _speak(self, text: str):
        try:
            resp = httpx.post(
                f"{JARVIS_URL}/api/voice/speak",
                json={"text": text},
                timeout=30,
            )
            if resp.status_code == 200:
                self._play_audio_bytes(resp.content)
        except Exception as e:
            logger.debug("TTS not available: %s", e)
            # Fallback: Windows TTS via PowerShell
            try:
                import subprocess
                safe = text.replace("'", "").replace('"', '')[:500]
                subprocess.Popen(
                    ["powershell", "-Command",
                     f"Add-Type -AssemblyName System.Speech; "
                     f"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                     f"$s.Rate = 2; $s.Speak('{safe}')"],
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
            except Exception:
                pass

    def _play_audio_bytes(self, audio_bytes: bytes):
        try:
            import sounddevice as sd
            import soundfile as sf
            import io
            data, sr = sf.read(io.BytesIO(audio_bytes))
            sd.play(data, sr)
            sd.wait()
        except Exception:
            pass

    def _play_activation_sound(self):
        """Play a short tone to indicate wake word was detected."""
        try:
            import sounddevice as sd
            t = np.linspace(0, 0.15, int(0.15 * 44100), False)
            tone = 0.3 * np.sin(2 * np.pi * 880 * t)
            sd.play(tone.astype(np.float32), 44100)
            sd.wait()
        except Exception:
            pass

    def run(self):
        self._load_models()

        try:
            import pyaudio
        except ImportError:
            logger.error("pyaudio not installed. Run: pip install pyaudio")
            sys.exit(1)

        p = pyaudio.PyAudio()
        stream = p.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=SAMPLE_RATE,
            input=True,
            frames_per_buffer=CHUNK_SIZE,
        )

        logger.info("=" * 50)
        logger.info("JARVIS Wake Word Listener Active")
        logger.info("Say 'Hey Jarvis' or 'Jarvis' to activate")
        logger.info("=" * 50)

        try:
            while True:
                data = stream.read(CHUNK_SIZE, exception_on_overflow=False)

                if self._oww_model:
                    audio_int16 = np.frombuffer(data, dtype=np.int16)
                    audio_float = audio_int16.astype(np.float32) / 32768.0
                    self._oww_model.predict(audio_float)

                    scores = self._oww_model.prediction_buffer.get("hey_jarvis", [])
                    if scores and scores[-1] > 0.5:
                        audio_bytes = self._record_after_wake(stream)
                        if audio_bytes:
                            text = self._transcribe(audio_bytes)
                            self._send_to_jarvis(text)
                else:
                    # Fallback: simple energy-based trigger for testing
                    rms = self._rms(data)
                    if rms > 3000:
                        audio_bytes = self._record_after_wake(stream)
                        if audio_bytes:
                            text = self._transcribe(audio_bytes)
                            self._send_to_jarvis(text)

        except KeyboardInterrupt:
            logger.info("Wake word listener stopped.")
        finally:
            stream.stop_stream()
            stream.close()
            p.terminate()


if __name__ == "__main__":
    assistant = VoiceAssistant()
    assistant.run()
