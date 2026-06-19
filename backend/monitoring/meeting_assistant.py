"""
JARVIS Real-Time Meeting Assistant
- Detects when you join Teams/Zoom/Meet
- Transcribes meeting audio
- Extracts action items with AI
- Sends you a summary when meeting ends
"""
import json
import logging
import threading
import time
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("jarvis.meeting")

_HISTORY_PATH = Path(__file__).parent.parent / "data" / "meeting_history.json"
_HISTORY_PATH.parent.mkdir(exist_ok=True)


def _load_history() -> list[dict]:
    try:
        return json.loads(_HISTORY_PATH.read_text(encoding="utf-8")) if _HISTORY_PATH.exists() else []
    except Exception:
        return []


def _save_meeting(record: dict):
    try:
        hist = _load_history()
        hist.insert(0, record)
        del hist[40:]
        _HISTORY_PATH.write_text(json.dumps(hist), encoding="utf-8")
    except Exception as e:
        logger.debug("meeting history save failed: %s", e)


def get_history(limit: int = 20) -> list[dict]:
    return _load_history()[:limit]

MEETING_STATE = {
    "active": False,
    "app": "",
    "start_time": None,
    "transcript": [],
    "action_items": [],
    "participants": [],
    "summary": "",
    "duration_minutes": 0,
}


class MeetingAssistant:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self.running = False
        self._was_in_meeting = False
        self._transcribe_thread: threading.Thread | None = None
        self._stop_transcribe = threading.Event()

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._thread.start()
        logger.info("Meeting assistant watching for calls...")

    def stop(self):
        self.running = False
        self._stop_transcribe.set()

    def _watch_loop(self):
        """Poll for active meeting app."""
        import psutil
        MEETING_PROCS = {
            "teams": "Microsoft Teams",
            "zoom": "Zoom",
            "webex": "Webex",
            "slack": "Slack",
            "discord": "Discord",
        }
        while self.running:
            try:
                running = {p.name().lower().replace(".exe", "") for p in psutil.process_iter(['name'])}
                meeting_app = next((v for k, v in MEETING_PROCS.items() if k in running), None)
                in_meeting = meeting_app is not None

                if in_meeting and not self._was_in_meeting:
                    self._was_in_meeting = True
                    self._on_meeting_start(meeting_app)
                elif not in_meeting and self._was_in_meeting:
                    self._was_in_meeting = False
                    self._on_meeting_end()

                MEETING_STATE["active"] = in_meeting
                if meeting_app:
                    MEETING_STATE["app"] = meeting_app

            except Exception as e:
                logger.debug("Meeting watch error: %s", e)
            time.sleep(10)

    def _on_meeting_start(self, app: str):
        logger.info("Meeting started in %s", app)
        try:
            from core.activity_log import log_event
            log_event("meeting", f"Meeting started in {app}", "info")
        except Exception:
            pass
        MEETING_STATE["start_time"] = datetime.now().isoformat()
        MEETING_STATE["transcript"] = []
        MEETING_STATE["action_items"] = []

        from voice.wake_word import _speak
        _speak(f"Meeting detected in {app}. I'm taking notes for you.")

        # Start mic transcription in background
        self._stop_transcribe.clear()
        self._transcribe_thread = threading.Thread(
            target=self._transcribe_loop, daemon=True
        )
        self._transcribe_thread.start()

        # Broadcast
        try:
            import httpx
            httpx.post("http://localhost:8000/api/meeting/event",
                       json={"event": "started", "app": app}, timeout=2)
        except Exception:
            pass

    def _on_meeting_end(self):
        logger.info("Meeting ended")
        self._stop_transcribe.set()
        start = MEETING_STATE.get("start_time")
        if start:
            duration = (datetime.now() - datetime.fromisoformat(start)).seconds // 60
            MEETING_STATE["duration_minutes"] = duration
        threading.Thread(target=self._generate_summary, daemon=True).start()

    def _transcribe_loop(self):
        """Continuously transcribe microphone audio during meeting."""
        try:
            import speech_recognition as sr
            recognizer = sr.Recognizer()
            mic = sr.Microphone()
            with mic as source:
                recognizer.adjust_for_ambient_noise(source, duration=1)
            logger.info("Meeting transcription active")

            while not self._stop_transcribe.is_set():
                try:
                    with mic as source:
                        audio = recognizer.listen(source, timeout=3, phrase_time_limit=15)
                    text = recognizer.recognize_google(audio)
                    if text and len(text) > 5:
                        entry = {
                            "time": datetime.now().strftime("%H:%M:%S"),
                            "text": text,
                        }
                        MEETING_STATE["transcript"].append(entry)
                        logger.debug("Transcribed: %s", text[:60])
                        # Broadcast live transcript to dashboard
                        try:
                            import httpx
                            httpx.post("http://localhost:8000/api/meeting/transcript",
                                       json=entry, timeout=2)
                        except Exception:
                            pass
                except Exception:
                    pass
        except Exception as e:
            logger.error("Transcription loop failed: %s", e)

    def _generate_summary(self):
        """Use AI to extract action items and generate summary."""
        transcript = MEETING_STATE.get("transcript", [])
        if not transcript:
            logger.info("No transcript to summarize")
            return

        full_text = "\n".join(f"[{t['time']}] {t['text']}" for t in transcript[-100:])
        prompt = f"""Meeting transcript (last portion):

{full_text}

Extract:
1. Key decisions made
2. Action items (who needs to do what)
3. A 3-sentence summary

Format as JSON: {{"summary": "...", "action_items": ["..."], "decisions": ["..."]}}"""

        try:
            from core.config import settings
            result = {}
            if settings.GROQ_API_KEY:
                from groq import Client
                client = Client(api_key=settings.GROQ_API_KEY)
                resp = client.chat.completions.create(
                    model=settings.GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=512,
                )
                import json
                text = resp.choices[0].message.content
                # Extract JSON from response
                start = text.find("{")
                end = text.rfind("}") + 1
                if start >= 0:
                    result = json.loads(text[start:end])

            summary = result.get("summary", "Meeting completed.")
            action_items = result.get("action_items", [])
            MEETING_STATE["summary"] = summary
            MEETING_STATE["action_items"] = action_items

            # Persist to meeting history + activity feed
            duration_m = MEETING_STATE.get("duration_minutes", 0)
            _save_meeting({
                "ended_at": datetime.now().isoformat(),
                "app": MEETING_STATE.get("app", ""),
                "duration_minutes": duration_m,
                "summary": summary,
                "action_items": action_items,
                "decisions": result.get("decisions", []),
                "transcript": MEETING_STATE.get("transcript", [])[-60:],
            })
            try:
                from core.activity_log import log_event
                log_event("meeting", f"Meeting ended ({duration_m}m) — {len(action_items)} action item(s)", "info")
            except Exception:
                pass

            # Speak summary
            from voice.wake_word import _speak
            duration = MEETING_STATE.get("duration_minutes", 0)
            _speak(f"Your {duration}-minute meeting has ended. {summary} I found {len(action_items)} action item(s).")

            # Push to phone
            from core.config import settings as s
            if s.NTFY_URL and s.NTFY_PUSH_TOPIC:
                import httpx
                body = f"{summary}\n\nAction items:\n" + "\n".join(f"• {a}" for a in action_items[:5])
                httpx.post(f"{s.NTFY_URL}/{s.NTFY_PUSH_TOPIC}",
                           data=body.encode(),
                           headers={"Title": "📋 Meeting Summary", "Priority": "default"})

        except Exception as e:
            logger.error("Summary generation failed: %s", e)

    def get_state(self) -> dict:
        return dict(MEETING_STATE)


_assistant = MeetingAssistant()


def get_assistant() -> MeetingAssistant:
    return _assistant
