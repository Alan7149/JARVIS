"""
Global TTS state — shared between wake_word.py and tts_tools.py
Prevents multiple voices playing simultaneously.
"""
import threading

# Single global lock — whoever holds it is currently speaking
TTS_LOCK = threading.Lock()
_current_proc = None


def set_proc(proc):
    global _current_proc
    _current_proc = proc


def kill_current():
    global _current_proc
    if _current_proc and _current_proc.poll() is None:
        try:
            _current_proc.terminate()
        except Exception:
            pass
    _current_proc = None
