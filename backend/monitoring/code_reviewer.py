"""
JARVIS AI Code Review on Save
Watches configured directories. When a code file is saved,
AI reviews it and speaks/shows critical issues immediately.
"""
import logging
import threading
import time
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("jarvis.code_review")

CODE_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rs", ".java", ".cs", ".cpp", ".c"}

REVIEW_STATE = {
    "active": False,
    "watching": [],
    "last_review": None,
    "reviews": [],
}

_debounce_timers: dict[str, threading.Timer] = {}
_DEBOUNCE_SECONDS = 3   # wait 3s after save before reviewing


async def _review_file(path: str):
    """Send file to AI for code review."""
    try:
        content = Path(path).read_text(encoding="utf-8", errors="ignore")
        if len(content.strip()) < 20:
            return

        # Truncate large files
        if len(content) > 6000:
            content = content[:6000] + "\n... [truncated]"

        from core.config import settings
        if not settings.GROQ_API_KEY:
            return

        from groq import Client
        client = Client(api_key=settings.GROQ_API_KEY)

        prompt = f"""You are a senior code reviewer. Review this code for:
1. Critical bugs (security issues, crashes, data loss)
2. Performance problems
3. Code quality issues

File: {Path(path).name}
```{Path(path).suffix.lstrip('.')}
{content}
```

Respond in this EXACT format:
SEVERITY: [CRITICAL/WARNING/INFO/CLEAN]
ISSUES:
- [issue description with line number if possible]
SUMMARY: [one sentence]

If no issues: SEVERITY: CLEAN, ISSUES: None, SUMMARY: Code looks good."""

        resp = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
        )
        review_text = resp.choices[0].message.content.strip()

        # Parse severity
        severity = "INFO"
        for line in review_text.split("\n"):
            if line.startswith("SEVERITY:"):
                severity = line.split(":", 1)[1].strip()
                break

        review = {
            "file": Path(path).name,
            "path": path,
            "severity": severity,
            "review": review_text,
            "time": datetime.now().isoformat(),
        }
        REVIEW_STATE["last_review"] = review
        REVIEW_STATE["reviews"] = ([review] + REVIEW_STATE["reviews"])[:20]

        # Broadcast to dashboard
        from core.websocket_manager import ws_manager
        import asyncio
        await ws_manager.broadcast("code_review", review)

        # Speak critical issues
        if severity in ("CRITICAL", "WARNING"):
            summary_line = next((l for l in review_text.split("\n") if l.startswith("SUMMARY:")), "")
            summary = summary_line.replace("SUMMARY:", "").strip() if summary_line else "Issues found."
            from voice.wake_word import _speak
            _speak(f"Code review alert in {Path(path).name}: {summary}")

        logger.info("Code review: %s → %s", Path(path).name, severity)

    except Exception as e:
        logger.error("Code review failed: %s", e)


def _on_file_changed(path: str):
    """Debounced file change handler."""
    if path in _debounce_timers:
        _debounce_timers[path].cancel()

    def _do_review():
        import asyncio
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_review_file(path))
        finally:
            loop.close()

    timer = threading.Timer(_DEBOUNCE_SECONDS, _do_review)
    _debounce_timers[path] = timer
    timer.start()


def start_watching(directory: str) -> dict:
    """Start watching a directory for code changes."""
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler, FileModifiedEvent

        path = Path(directory)
        if not path.exists():
            return {"error": f"Directory not found: {directory}"}

        class CodeHandler(FileSystemEventHandler):
            def on_modified(self, event):
                if not event.is_directory:
                    fp = event.src_path
                    if Path(fp).suffix.lower() in CODE_EXTENSIONS:
                        _on_file_changed(fp)

        observer = Observer()
        observer.schedule(CodeHandler(), str(path), recursive=True)
        observer.daemon = True
        observer.start()

        if directory not in REVIEW_STATE["watching"]:
            REVIEW_STATE["watching"].append(directory)
        REVIEW_STATE["active"] = True

        logger.info("Code reviewer watching: %s", directory)
        return {"watching": directory, "active": True}

    except Exception as e:
        return {"error": str(e)}


def stop_watching():
    REVIEW_STATE["active"] = False
    REVIEW_STATE["watching"] = []
