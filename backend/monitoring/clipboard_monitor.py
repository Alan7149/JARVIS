"""
JARVIS Smart Clipboard Manager
- Monitors clipboard continuously
- Logs every copy with timestamp, app context, content type
- Searchable via voice: "JARVIS, find that API key I copied"
- Detects passwords/secrets and warns
"""
import logging
import re
import threading
import time
from datetime import datetime
from typing import Optional

logger = logging.getLogger("jarvis.clipboard")

# In-memory store (backed by DB for persistence)
_clipboard_history: list[dict] = []
_MAX_HISTORY = 500
_lock = threading.Lock()

# Patterns to detect sensitive content
_SENSITIVE_PATTERNS = [
    (re.compile(r'(sk-ant|sk-[a-zA-Z0-9]{20,})', re.I), "Anthropic API key"),
    (re.compile(r'(ghp_|github_pat_)[a-zA-Z0-9]+', re.I), "GitHub token"),
    (re.compile(r'AKIA[A-Z0-9]{16}', re.I), "AWS access key"),
    (re.compile(r'(?i)password[\s:=]+\S+'), "Password"),
    (re.compile(r'Bearer [a-zA-Z0-9\-_.]+'), "Auth token"),
    (re.compile(r'[a-zA-Z0-9]{32,}'), None),  # Generic long token
]


def _classify_content(text: str) -> str:
    """Classify clipboard content type."""
    text = text.strip()
    if re.match(r'^https?://', text):
        return "url"
    if re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', text):
        return "email"
    if re.match(r'^\d[\d\s\-+()]{7,}$', text):
        return "phone"
    if len(text) > 500:
        return "long_text"
    if re.match(r'^\s*(import|def |class |function|const |let |var )', text, re.MULTILINE):
        return "code"
    if re.match(r'^[\d.]+$', text):
        return "number"
    return "text"


def _detect_sensitive(text: str) -> Optional[str]:
    for pattern, label in _SENSITIVE_PATTERNS:
        if pattern.search(text):
            return label or "Secret/token"
    return None


def _get_active_app() -> str:
    try:
        import win32gui
        import win32process
        import psutil
        hwnd = win32gui.GetForegroundWindow()
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        return psutil.Process(pid).name().replace(".exe", "")
    except Exception:
        return "unknown"


def _get_clipboard_text() -> Optional[str]:
    try:
        import win32clipboard
        win32clipboard.OpenClipboard()
        try:
            if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                return win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
        finally:
            win32clipboard.CloseClipboard()
    except Exception:
        pass
    try:
        import pyperclip
        return pyperclip.paste()
    except Exception:
        return None


class ClipboardMonitor:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self.running = False
        self._last_text = ""

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("Clipboard monitor started")

    def stop(self):
        self.running = False

    def _loop(self):
        while self.running:
            try:
                text = _get_clipboard_text()
                if text and text != self._last_text and len(text.strip()) > 1:
                    self._last_text = text
                    self._on_copy(text)
            except Exception:
                pass
            time.sleep(0.8)

    def _on_copy(self, text: str):
        app = _get_active_app()
        content_type = _classify_content(text)
        sensitive = _detect_sensitive(text)

        entry = {
            "id": len(_clipboard_history) + 1,
            "text": text[:2000],
            "preview": text[:120],
            "app": app,
            "type": content_type,
            "sensitive": sensitive,
            "timestamp": datetime.now().isoformat(),
            "time": datetime.now().strftime("%H:%M:%S"),
        }

        with _lock:
            _clipboard_history.insert(0, entry)
            if len(_clipboard_history) > _MAX_HISTORY:
                _clipboard_history.pop()

        if sensitive:
            logger.warning("Sensitive content copied: %s from %s", sensitive, app)
            # Warn user via voice
            from voice.wake_word import _speak
            _speak(f"Warning: {sensitive} detected in clipboard from {app}.")

        logger.debug("Clipboard: [%s] %s... from %s", content_type, text[:30], app)


def get_history(limit: int = 50, query: str = "") -> list[dict]:
    with _lock:
        history = _clipboard_history[:limit * 3] if query else _clipboard_history[:limit]
    if query:
        q = query.lower()
        history = [h for h in history if q in h["text"].lower() or q in h["app"].lower()][:limit]
    return history


def search_clipboard(query: str) -> list[dict]:
    return get_history(limit=10, query=query)


def clear_history():
    with _lock:
        _clipboard_history.clear()


_monitor = ClipboardMonitor()


def get_monitor() -> ClipboardMonitor:
    return _monitor
