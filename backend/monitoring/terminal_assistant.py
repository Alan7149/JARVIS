"""
JARVIS Terminal Assistant
Watches clipboard and screen for terminal errors.
When a command fails, auto-analyzes the error and speaks/shows the fix.
Also provides a shell wrapper that can intercept commands.
"""
import logging
import re
import threading
import time

logger = logging.getLogger("jarvis.terminal")

ERROR_PATTERNS = [
    r"Error:",r"error:",r"ERROR",r"Exception",r"Traceback",
    r"command not found",r"No such file",r"Permission denied",
    r"ModuleNotFoundError",r"ImportError",r"SyntaxError",
    r"TypeError",r"ValueError",r"KeyError",r"AttributeError",
    r"FAILED",r"fatal:",r"npm ERR",r"pip.*error",r"\[ERROR\]",
]

_COMPILED = [re.compile(p) for p in ERROR_PATTERNS]
_last_analyzed = ""
_running = False


def _looks_like_error(text: str) -> bool:
    return any(p.search(text) for p in _COMPILED)


async def analyze_error(error_text: str) -> str:
    """Send error to Groq and get a fix."""
    from core.config import settings
    if not settings.GROQ_API_KEY:
        return ""
    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        resp = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{
                "role": "system",
                "content": "You are a senior developer. When given an error, respond with: 1 sentence explanation + the exact fix command/code. Be concise — max 2 sentences total."
            }, {
                "role": "user",
                "content": f"Fix this error:\n{error_text[:800]}"
            }],
            max_tokens=200,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.error("Terminal analysis failed: %s", e)
        return ""


class TerminalAssistant:
    """Monitors clipboard for terminal errors and auto-fixes them."""

    def __init__(self):
        self._thread: threading.Thread | None = None
        self.running = False
        self._last_clip = ""

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("Terminal assistant watching for errors")

    def stop(self):
        self.running = False

    def _loop(self):
        import asyncio
        while self.running:
            try:
                # Check clipboard for errors
                clip = self._get_clipboard()
                if clip and clip != self._last_clip and len(clip) > 20:
                    if _looks_like_error(clip) and clip != _last_analyzed:
                        self._last_clip = clip
                        asyncio.run(self._handle_error(clip))
            except Exception:
                pass
            time.sleep(1.5)

    async def _handle_error(self, error_text: str):
        global _last_analyzed
        _last_analyzed = error_text

        fix = await analyze_error(error_text)
        if not fix:
            return

        logger.info("Terminal fix: %s", fix[:100])

        # Copy fix to clipboard so user can paste it
        try:
            import pyperclip
            # Only copy if the fix contains a command (starts with common command words)
            cmd_words = ["pip", "npm", "python", "node", "cd", "git", "sudo", "apt", "brew", "run", "install"]
            if any(w in fix.lower() for w in cmd_words):
                # Extract just the command part
                for line in fix.split('\n'):
                    if any(w in line.lower() for w in cmd_words):
                        pyperclip.copy(line.strip().strip('`'))
                        break
        except Exception:
            pass

        # Speak the fix
        from voice.wake_word import _speak
        _speak(f"Terminal error detected. {fix}")

        # Broadcast to dashboard
        from core.websocket_manager import ws_manager
        import asyncio
        try:
            await ws_manager.broadcast("terminal_error", {
                "error": error_text[:200],
                "fix": fix,
                "time": __import__('time').strftime("%H:%M:%S"),
            })
        except Exception:
            pass

    def _get_clipboard(self) -> str:
        try:
            import pyperclip
            return pyperclip.paste() or ""
        except Exception:
            return ""


_assistant = TerminalAssistant()


def get_assistant() -> TerminalAssistant:
    return _assistant
