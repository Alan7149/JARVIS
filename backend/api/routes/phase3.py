"""All Phase 3 feature API routes — unified."""
import asyncio
import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger("jarvis.phase3")

# ── Knowledge Base / Second Brain ────────────────────────────────────────────

@router.get("/brain/stats")
async def brain_stats():
    from tools.knowledge_base import KnowledgeBase
    return KnowledgeBase.get_stats()

@router.post("/brain/index")
async def brain_index(payload: dict):
    from tools.knowledge_base import KnowledgeBase
    directory = payload.get("directory", "")
    obsidian = payload.get("obsidian", False)
    loop = asyncio.get_event_loop()
    if obsidian:
        result = await loop.run_in_executor(None, KnowledgeBase.index_obsidian, directory)
    else:
        result = await loop.run_in_executor(None, KnowledgeBase.index_directory, directory)
    return result

@router.get("/brain/search")
async def brain_search(q: str, limit: int = 8):
    from tools.knowledge_base import KnowledgeBase
    return await asyncio.get_event_loop().run_in_executor(
        None, lambda: KnowledgeBase.search(q, limit=limit)
    )

@router.post("/brain/note")
async def brain_add_note(payload: dict):
    from tools.knowledge_base import KnowledgeBase
    return KnowledgeBase.add_note(
        title=payload.get("title", "Quick Note"),
        content=payload.get("content", ""),
        tags=payload.get("tags", []),
    )


@router.post("/brain/chat")
async def brain_chat(payload: dict):
    """Conversational RAG — answers from the knowledge base with inline [n] citations."""
    from tools.knowledge_base import KnowledgeBase
    from tools.llm_provider import llm_complete
    question = (payload.get("question") or "").strip()
    history = payload.get("history", [])
    if not question:
        return {"answer": "Ask me something about your notes.", "sources": []}

    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(None, lambda: KnowledgeBase.search(question, limit=6, use_ai=False))
    docs = res.get("results", [])
    if not docs:
        return {"answer": "I couldn't find anything about that in your indexed notes. Try indexing more, or rephrasing.", "sources": []}

    context = "\n\n".join(f"[{i+1}] {d['title']}:\n{d['snippet']}" for i, d in enumerate(docs))
    hist = "\n".join(f"{m.get('role')}: {m.get('content')}" for m in history[-6:])
    system = ("You are JARVIS answering from the user's personal knowledge base. Answer ONLY using the "
              "numbered sources provided. Cite them inline like [1], [2] right after the claims they support. "
              "If the sources don't contain the answer, say so plainly. Be concise and direct.")
    user = (f"Conversation so far:\n{hist}\n\n" if hist else "") + f"Sources:\n{context}\n\nQuestion: {question}"
    out = await llm_complete(system=system, user=user, max_tokens=700)
    if "error" in out:
        return {"answer": out["error"], "sources": []}
    sources = [{"n": i + 1, "id": d.get("id"), "title": d["title"], "path": d["path"],
                "score": d["score"], "source": d.get("source", "files")} for i, d in enumerate(docs)]
    return {"answer": out["text"], "sources": sources, "provider": out.get("provider")}


@router.get("/brain/document")
async def brain_document(id: str | None = None, path: str | None = None):
    from tools.knowledge_base import KnowledgeBase
    return KnowledgeBase.get_document(id if id is not None else path)


@router.get("/brain/related")
async def brain_related(id: str | None = None, path: str | None = None, limit: int = 5):
    from tools.knowledge_base import KnowledgeBase
    return KnowledgeBase.related(id if id is not None else path, limit=limit)


@router.post("/brain/ingest-text")
async def brain_ingest_text(payload: dict):
    """Index a dropped text/markdown/code file (content read client-side)."""
    from tools.knowledge_base import KnowledgeBase
    return KnowledgeBase.index_text(
        title=payload.get("title", "Dropped file"),
        content=payload.get("content", ""),
        source="upload",
        path=payload.get("filename"),
    )


@router.post("/brain/ingest-url")
async def brain_ingest_url(payload: dict):
    """Fetch a web page, strip it to text, and index it."""
    import re as _re
    url = (payload.get("url") or "").strip()
    if not url:
        return {"error": "No URL provided"}
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0 (JARVIS)"}) as cli:
            r = await cli.get(url)
        html = r.text
    except Exception as e:
        return {"error": f"Fetch failed: {e}"}

    title_m = _re.search(r"<title[^>]*>(.*?)</title>", html, _re.I | _re.S)
    title = (title_m.group(1).strip() if title_m else url)[:120]
    # crude text extraction
    text = _re.sub(r"(?is)<(script|style|head|nav|footer)[^>]*>.*?</\1>", " ", html)
    text = _re.sub(r"(?s)<[^>]+>", " ", text)
    text = _re.sub(r"&[a-z#0-9]+;", " ", text)
    text = _re.sub(r"\s+", " ", text).strip()
    if len(text) < 80:
        return {"error": "Could not extract readable text from that page."}
    from tools.knowledge_base import KnowledgeBase
    res = KnowledgeBase.index_text(title=title, content=text, source="web", path=url)
    res["title"] = title
    return res

# ── WhatsApp ─────────────────────────────────────────────────────────────────
# WhatsApp state shared between endpoints
_wa_state = {
    "ready": False,
    "qr": None,          # raw QR string from whatsapp-web.js
    "process": None,     # subprocess handle
    "name": "",
    "phone": "",
}


def _ensure_wa_service():
    """Auto-start the WhatsApp Node.js service if not running."""
    import subprocess, sys
    from pathlib import Path

    if _wa_state["process"] and _wa_state["process"].poll() is None:
        return  # already running

    wa_dir = Path(__file__).parent.parent.parent.parent / "whatsapp-service"
    if not (wa_dir / "index.js").exists():
        logger.warning("WhatsApp service not found at %s", wa_dir)
        return

    try:
        proc = subprocess.Popen(
            ["node", "index.js"],
            cwd=str(wa_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        _wa_state["process"] = proc

        # Read output in background thread to capture QR
        import threading
        def _read_output():
            for line in proc.stdout:
                line = line.strip()
                if line:
                    logger.debug("[WA] %s", line[:120])
        threading.Thread(target=_read_output, daemon=True).start()
        logger.info("WhatsApp service started (PID %d)", proc.pid)
    except Exception as e:
        logger.error("Failed to start WhatsApp service: %s", e)


@router.get("/whatsapp/status")
async def wa_status():
    _ensure_wa_service()
    import httpx, asyncio
    # Poll the Node service directly
    for attempt in range(3):
        try:
            r = await httpx.AsyncClient(timeout=4).get("http://localhost:3001/status")
            data = r.json()
            _wa_state["ready"] = data.get("ready", False)
            return data
        except Exception:
            if attempt < 2:
                await asyncio.sleep(1)
    return {"ready": False, "starting": True, "message": "WhatsApp service starting up, please wait 10 seconds..."}


@router.get("/whatsapp/qr-image")
async def wa_qr_image():
    """Return the QR code as a PNG image — no JS libraries needed."""
    from fastapi.responses import Response
    import httpx

    _ensure_wa_service()

    # Get QR data from Node service
    qr_data = None
    try:
        r = await httpx.AsyncClient(timeout=5).get("http://localhost:3001/qr")
        d = r.json()
        if d.get("ready"):
            # Already connected — return a "connected" image
            import qrcode, io
            img = qrcode.make("CONNECTED")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return Response(content=buf.getvalue(), media_type="image/png",
                          headers={"X-Status": "connected"})
        qr_data = d.get("qr")
    except Exception:
        pass

    if not qr_data:
        # Return placeholder
        try:
            import qrcode, io
            img = qrcode.make("WAITING_FOR_QR")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return Response(content=buf.getvalue(), media_type="image/png",
                          headers={"X-Status": "waiting"})
        except Exception as e:
            return Response(content=b"", media_type="image/png")

    # Generate QR image from data
    try:
        import qrcode, io
        from PIL import Image
        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_L,
                           box_size=8, border=2)
        qr.add_data(qr_data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png",
                       headers={"X-Status": "qr_ready", "Cache-Control": "no-cache"})
    except Exception as e:
        return Response(content=b"", media_type="image/png")


from fastapi.responses import HTMLResponse as _HTML

@router.get("/whatsapp/qr-page", response_class=_HTML)
async def wa_qr_page():
    """Self-contained QR scan page — works without any external JS libraries."""
    _ensure_wa_service()
    return _HTML(content="""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JARVIS — Connect WhatsApp</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  background:#020b18;color:#00d4ff;
  font-family:'Courier New',monospace;
  display:flex;flex-direction:column;align-items:center;
  justify-content:center;min-height:100vh;gap:16px;padding:20px;
}
h1{font-size:22px;font-weight:700;letter-spacing:.3em;
   text-shadow:0 0 20px rgba(0,212,255,.9)}
.subtitle{font-size:10px;color:rgba(0,212,255,.5);letter-spacing:.2em}
.status-box{
  padding:10px 24px;border:1px solid rgba(0,212,255,.35);
  font-size:12px;letter-spacing:.15em;text-align:center;
  transition:all .3s;min-width:300px;
}
.status-box.connected{color:#00ff88;border-color:rgba(0,255,136,.4);
  box-shadow:0 0 12px rgba(0,255,136,.15)}
.status-box.waiting{color:#ff9900;border-color:rgba(255,153,0,.4)}
.status-box.ready{color:#00d4ff;border-color:rgba(0,212,255,.4)}
.qr-frame{
  background:white;padding:16px;border-radius:4px;
  border:3px solid rgba(0,212,255,.4);
  box-shadow:0 0 30px rgba(0,212,255,.2);
}
.qr-frame img{display:block;width:280px;height:280px;image-rendering:pixelated}
.steps{max-width:320px;space-y:6px}
.step{display:flex;gap:10px;align-items:flex-start;font-size:11px;
      color:rgba(0,212,255,.7);padding:4px 0;letter-spacing:.05em}
.step-num{color:#00d4ff;font-weight:700;flex-shrink:0;min-width:16px}
.refresh-btn{
  padding:8px 24px;background:rgba(0,212,255,.08);
  border:1px solid rgba(0,212,255,.35);color:#00d4ff;
  font-family:'Courier New',monospace;font-size:11px;
  letter-spacing:.15em;cursor:pointer;transition:all .2s;
}
.refresh-btn:hover{background:rgba(0,212,255,.15)}
.timer{font-size:9px;color:rgba(0,212,255,.4);letter-spacing:.1em}
</style>
</head>
<body>
<h1>⚡ JARVIS WHATSAPP</h1>
<div class="subtitle">SECURE DEVICE LINK</div>

<div class="status-box" id="status">INITIALIZING...</div>

<div class="qr-frame" id="qr-frame">
  <img id="qr-img" src="/api/whatsapp/qr-image" alt="QR Code" />
</div>

<div class="steps">
  <div class="step"><span class="step-num">1</span><span>Open WhatsApp on your iPhone</span></div>
  <div class="step"><span class="step-num">2</span><span>Settings → Linked Devices → Link a Device</span></div>
  <div class="step"><span class="step-num">3</span><span>Point camera at the QR code above</span></div>
  <div class="step"><span class="step-num">4</span><span>Wait for "Device linked" confirmation</span></div>
</div>

<div class="timer" id="timer">Auto-refreshing in 5s...</div>
<button class="refresh-btn" onclick="refresh()">↻ REFRESH NOW</button>

<script>
let countdown = 5;
let timer;

function refresh() {
  clearInterval(timer);
  document.getElementById('qr-img').src = '/api/whatsapp/qr-image?t=' + Date.now();
  checkStatus();
  countdown = 5;
  startTimer();
}

async function checkStatus() {
  try {
    const r = await fetch('/api/whatsapp/status');
    const d = await r.json();
    const el = document.getElementById('status');
    const frame = document.getElementById('qr-frame');
    if (d.ready) {
      el.textContent = '✅ WHATSAPP CONNECTED — ' + (d.name || 'Linked');
      el.className = 'status-box connected';
      frame.style.display = 'none';
      document.getElementById('timer').textContent = 'Connected! You can close this page.';
      clearInterval(timer);
    } else if (d.starting) {
      el.textContent = '⏳ ' + d.message;
      el.className = 'status-box waiting';
    } else if (d.qrPending) {
      el.textContent = '📱 SCAN QR CODE WITH YOUR iPHONE';
      el.className = 'status-box ready';
      frame.style.display = 'block';
    } else {
      el.textContent = '⏳ WAITING FOR QR CODE...';
      el.className = 'status-box waiting';
    }
  } catch(e) {
    document.getElementById('status').textContent = '⚠ BACKEND UNREACHABLE — REFRESH PAGE';
  }
}

function startTimer() {
  timer = setInterval(() => {
    countdown--;
    document.getElementById('timer').textContent = 'Auto-refreshing in ' + countdown + 's...';
    if (countdown <= 0) refresh();
  }, 1000);
}

checkStatus();
startTimer();
</script>
</body>
</html>""")

@router.get("/whatsapp/messages")
async def wa_messages(limit: int = 20, q: str = ""):
    import httpx
    try:
        url = f"http://localhost:3001/messages?limit={limit}"
        if q: url += f"&q={q}"
        r = await httpx.AsyncClient(timeout=5).get(url)
        return r.json()
    except Exception as e:
        return {"error": str(e), "messages": []}

@router.get("/whatsapp/chats")
async def wa_chats():
    import httpx
    try:
        r = await httpx.AsyncClient(timeout=8).get("http://localhost:3001/chats")
        return r.json()
    except Exception as e:
        return {"error": str(e)}

@router.post("/whatsapp/send")
async def wa_send(payload: dict):
    import httpx
    try:
        r = await httpx.AsyncClient(timeout=10).post(
            "http://localhost:3001/send", json=payload
        )
        return r.json()
    except Exception as e:
        return {"error": str(e)}

@router.post("/whatsapp/send-by-name")
async def wa_send_by_name(payload: dict):
    import httpx
    try:
        r = await httpx.AsyncClient(timeout=10).post(
            "http://localhost:3001/send-by-name", json=payload
        )
        return r.json()
    except Exception as e:
        return {"error": str(e)}

@router.get("/whatsapp/qr")
async def wa_qr():
    import httpx
    try:
        r = await httpx.AsyncClient(timeout=3).get("http://localhost:3001/qr")
        return r.json()
    except Exception:
        return {"qr": None, "ready": False}

@router.post("/whatsapp/event")
async def wa_event(request: Request):
    """Receive events from the WhatsApp Node.js service."""
    payload = await request.json()
    event = payload.get("event")
    data = payload.get("data", {})

    from core.websocket_manager import ws_manager
    await ws_manager.broadcast("whatsapp_event", {"event": event, "data": data})

    # Handle incoming message — optionally route to JARVIS AI
    if event == "whatsapp_message":
        body = data.get("body", "")
        # Check if message starts with @JARVIS
        if body.lower().startswith("@jarvis"):
            command = body[7:].strip()
            if command:
                asyncio.create_task(_handle_wa_command(data.get("from", ""), command))

    return {"ok": True}


async def _handle_wa_command(sender: str, command: str):
    """Process a WhatsApp message addressed to JARVIS."""
    try:
        from agent.jarvis_agent import jarvis
        reply = ""
        async for chunk in jarvis.chat_stream(message=command, device="whatsapp"):
            if chunk.get("type") == "text":
                reply += chunk["data"]

        if reply:
            import httpx
            # Find sender phone from "Name" format
            await httpx.AsyncClient(timeout=10).post(
                "http://localhost:3001/send",
                json={"to": sender.replace("@c.us", ""), "message": f"JARVIS: {reply[:500]}"}
            )
    except Exception as e:
        logger.error("WhatsApp command error: %s", e)


# ── Code Review ──────────────────────────────────────────────────────────────

@router.get("/code-review/status")
async def cr_status():
    from monitoring.code_reviewer import REVIEW_STATE
    return dict(REVIEW_STATE)

@router.post("/code-review/watch")
async def cr_watch(payload: dict):
    from monitoring.code_reviewer import start_watching
    return start_watching(payload.get("directory", ""))

@router.post("/code-review/stop")
async def cr_stop():
    from monitoring.code_reviewer import stop_watching
    stop_watching()
    return {"stopped": True}

# ── Language Learning ────────────────────────────────────────────────────────

@router.get("/language/stats")
async def lang_stats(language: str = None):
    from monitoring.language_learning import get_stats
    return get_stats(language)

@router.post("/language/session")
async def lang_session(payload: dict):
    from monitoring.language_learning import run_daily_session
    lang = payload.get("language", "hindi")
    words = payload.get("words", 5)
    asyncio.create_task(run_daily_session(lang, words))
    return {"started": True, "language": lang, "words": words}

@router.post("/language/quiz")
async def lang_quiz(payload: dict):
    from monitoring.language_learning import quiz
    asyncio.create_task(quiz(payload.get("language", "hindi"), payload.get("count", 3)))
    return {"started": True}

# ── Bedside Mode ─────────────────────────────────────────────────────────────

@router.post("/bedside/activate")
async def bedside_activate(payload: dict):
    """Called when user activates bedside mode from iPhone shortcut."""
    wake_time = payload.get("wake_time", "07:30")
    asyncio.create_task(_bedside_routine(wake_time))
    return {"activated": True, "alarm": wake_time}

@router.post("/bedside/morning")
async def bedside_morning():
    """Called from iPhone morning alarm shortcut."""
    asyncio.create_task(_morning_routine())
    return {"triggered": True}

async def _bedside_routine(wake_time: str):
    """Evening bedside routine."""
    import subprocess
    from voice.wake_word import _speak
    from core.config import settings
    import httpx

    hour, minute = map(int, wake_time.split(":"))

    # 1. Speak goodnight summary
    from monitoring.daily_briefing import run_daily_briefing
    _speak(f"Goodnight, sir. I'll wake you at {wake_time}. Here's your day summary.")
    await run_daily_briefing()

    # 2. Dim laptop screen
    try:
        subprocess.run(
            ["powershell", "-Command",
             "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, 10)"],
            creationflags=subprocess.CREATE_NO_WINDOW, check=False
        )
    except Exception:
        pass

    # 3. Push notification to iPhone with alarm reminder
    if settings.NTFY_URL and settings.NTFY_PUSH_TOPIC:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"{settings.NTFY_URL}/{settings.NTFY_PUSH_TOPIC}",
                data=f"Alarm set for {wake_time}. Sleep well.".encode(),
                headers={"Title": "🌙 JARVIS Bedside Mode", "Tags": "moon", "Priority": "low"}
            )

    _speak("Goodnight. Rest well.")


async def _morning_routine():
    """Morning alarm routine — called from iPhone shortcut."""
    from voice.wake_word import _speak
    from core.config import settings
    import httpx

    hour = __import__("time").localtime().tm_hour
    greeting = "Good morning" if hour < 12 else "Good afternoon"

    _speak(f"{greeting}, sir. Time to wake up.")

    # Run daily briefing
    from monitoring.daily_briefing import run_daily_briefing
    await run_daily_briefing()

    # Restore screen brightness
    import subprocess
    try:
        subprocess.run(
            ["powershell", "-Command",
             "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, 80)"],
            creationflags=subprocess.CREATE_NO_WINDOW, check=False
        )
    except Exception:
        pass
