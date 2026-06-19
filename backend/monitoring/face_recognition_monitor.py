"""
JARVIS Face Recognition Login
- Trains on your face via webcam
- Greets you when you sit down
- Locks screen when you leave
"""
import asyncio
import logging
import os
import pickle
import subprocess
import threading
import time
from pathlib import Path

logger = logging.getLogger("jarvis.face")

FACE_DATA_PATH = Path(__file__).parent.parent / "data" / "face_model.pkl"
FACE_DATA_PATH.parent.mkdir(exist_ok=True)

STATE = {
    "running": False,
    "user_present": False,
    "last_seen": 0,
    "confidence": 0.0,
    "status": "idle",   # idle | watching | user_present | user_absent
}

ABSENT_LOCK_SECONDS = 30   # lock screen after 30s absence
CHECK_INTERVAL = 0.5        # check every 0.5s


class FaceMonitor:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self._recognizer = None
        self._face_cascade = None
        self._known_face = False

    def _load_opencv(self):
        import cv2
        self._face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        # Try contrib LBPH first, fall back to basic detection only
        try:
            self._recognizer = cv2.face.LBPHFaceRecognizer_create()
            if FACE_DATA_PATH.exists():
                self._recognizer.read(str(FACE_DATA_PATH))
                self._known_face = True
                logger.info("Loaded existing face model (LBPH)")
        except AttributeError:
            logger.warning("cv2.face not available — using presence-only detection (no recognition). Install opencv-contrib-python for full face ID.")
            self._recognizer = None
        return cv2

    def train(self, seconds: int = 5) -> dict:
        """Capture face from webcam and train the recognizer."""
        import cv2
        import numpy as np

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            return {"success": False, "error": "Could not open webcam"}

        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        recognizer = cv2.face.LBPHFaceRecognizer_create()

        faces_data = []
        labels = []
        start = time.time()
        captured = 0

        logger.info("Capturing face for %ds...", seconds)
        while time.time() - start < seconds:
            ret, frame = cap.read()
            if not ret:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, 1.3, 5)
            for (x, y, w, h) in faces:
                face_roi = gray[y:y+h, x:x+w]
                face_roi = cv2.resize(face_roi, (100, 100))
                faces_data.append(face_roi)
                labels.append(0)
                captured += 1

            time.sleep(0.1)

        cap.release()

        if captured < 5:
            return {"success": False, "error": f"Only {captured} face frames captured. Make sure you're in front of the camera in good lighting."}

        # Try LBPH training if available
        try:
            recognizer.train(faces_data, np.array(labels))
            recognizer.save(str(FACE_DATA_PATH))
            self._recognizer = recognizer
            self._known_face = True
            logger.info("Face model trained with %d samples (LBPH)", captured)
        except Exception as e:
            logger.warning("LBPH training failed: %s — using presence-only mode", e)
            self._known_face = True  # still track presence

        self._face_cascade = cascade
        return {"success": True, "samples": captured, "mode": "recognition" if self._recognizer else "presence-only"}

    def start(self):
        if STATE["running"]:
            return
        STATE["running"] = True
        STATE["status"] = "watching"
        self._thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._thread.start()
        logger.info("Face monitor started")

    def stop(self):
        STATE["running"] = False
        STATE["status"] = "idle"

    def _watch_loop(self):
        try:
            cv2 = self._load_opencv()
        except Exception as e:
            logger.error("OpenCV load failed: %s", e)
            STATE["running"] = False
            return

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            logger.error("Cannot open webcam")
            STATE["running"] = False
            return

        last_lock_notify = 0
        last_greet = 0

        while STATE["running"]:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.5)
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self._face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(80, 80))

            if len(faces) > 0:
                # Recognize face if model trained, else just detect presence
                is_known = False
                if self._recognizer is not None and self._known_face:
                    (x, y, w, h) = faces[0]
                    face_roi = cv2.resize(gray[y:y+h, x:x+w], (100, 100))
                    try:
                        label, confidence = self._recognizer.predict(face_roi)
                        is_known = confidence < 80
                        STATE["confidence"] = round(100 - confidence, 1)
                    except Exception:
                        is_known = True  # fallback: assume known if model broken
                else:
                    # No model yet — just detect presence
                    is_known = True
                    STATE["confidence"] = 99.0

                if is_known:
                    now = time.time()
                    STATE["last_seen"] = now
                    STATE["confidence"] = round(100 - confidence, 1)

                    if not STATE["user_present"]:
                        STATE["user_present"] = True
                        STATE["status"] = "user_present"
                        # Greet user (throttle to once per minute)
                        if now - last_greet > 60:
                            last_greet = now
                            threading.Thread(target=self._on_user_arrived, daemon=True).start()

            else:
                now = time.time()
                if STATE["user_present"] and STATE["last_seen"] > 0:
                    absent_for = now - STATE["last_seen"]
                    if absent_for > ABSENT_LOCK_SECONDS:
                        STATE["user_present"] = False
                        STATE["status"] = "user_absent"
                        if now - last_lock_notify > 120:
                            last_lock_notify = now
                            threading.Thread(target=self._on_user_left, daemon=True).start()

            time.sleep(CHECK_INTERVAL)

        cap.release()

    def _on_user_arrived(self):
        from voice.wake_word import _speak
        import httpx
        hour = time.localtime().tm_hour
        greeting = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"
        msg = f"{greeting}, sir. Welcome back. All systems are online."
        _speak(msg)
        # Broadcast to dashboard
        try:
            httpx.post(f"http://localhost:8000/api/face/event",
                       json={"event": "user_arrived", "message": msg}, timeout=3)
        except Exception:
            pass

    def _on_user_left(self):
        from voice.wake_word import _speak
        logger.info("User left — locking screen")
        # Lock Windows screen
        subprocess.run(["rundll32.exe", "user32.dll,LockWorkStation"], check=False)
        logger.info("Screen locked after face absence")


_monitor = FaceMonitor()


def get_monitor() -> FaceMonitor:
    return _monitor


def get_state() -> dict:
    return dict(STATE)
