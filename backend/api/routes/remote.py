"""
JARVIS PC Remote Control
iPhone opens http://<YOUR_TAILSCALE_IP>:8000/remote in Safari
Gets live screen stream + touch controls for mouse/keyboard
"""
import asyncio
import base64
import io
import logging
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

logger = logging.getLogger("jarvis.remote")
router = APIRouter()

_DIST = Path(__file__).parent.parent.parent.parent / "frontend" / "dist"


@router.get("/remote", response_class=HTMLResponse)
async def remote_page():
    """Mobile-optimized remote control page."""
    return HTMLResponse(content=_REMOTE_HTML)


@router.websocket("/remote/ws")
async def remote_ws(websocket: WebSocket):
    """WebSocket: streams screenshots + accepts control commands."""
    await websocket.accept()
    logger.info("Remote control connected: %s", websocket.client)
    stream_task = asyncio.create_task(_stream_screen(websocket))

    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_command(msg)
    except WebSocketDisconnect:
        logger.info("Remote control disconnected")
    except Exception as e:
        logger.error("Remote WS error: %s", e)
    finally:
        stream_task.cancel()


async def _stream_screen(ws: WebSocket):
    """Send JPEG screenshots at ~10fps."""
    try:
        import mss
        from PIL import Image
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            while True:
                try:
                    screenshot = sct.grab(monitor)
                    img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
                    # Scale down for mobile bandwidth
                    img.thumbnail((960, 540))
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=60, optimize=True)
                    b64 = base64.b64encode(buf.getvalue()).decode()
                    await ws.send_json({"type": "frame", "data": b64,
                                        "w": img.width, "h": img.height})
                    await asyncio.sleep(0.1)  # 10fps
                except Exception as e:
                    logger.debug("Frame capture error: %s", e)
                    await asyncio.sleep(0.5)
    except asyncio.CancelledError:
        pass


async def _handle_command(msg: dict):
    """Execute mouse/keyboard commands from phone."""
    try:
        import pyautogui
        pyautogui.FAILSAFE = False
        cmd = msg.get("cmd")
        # Get actual screen size for coordinate scaling
        import mss
        with mss.mss() as sct:
            mon = sct.monitors[1]
            sw, sh = mon["width"], mon["height"]

        if cmd == "move":
            # msg.x and msg.y are 0-1 normalized from phone screen
            x = int(msg["x"] * sw)
            y = int(msg["y"] * sh)
            pyautogui.moveTo(x, y, duration=0)
        elif cmd == "click":
            x = int(msg["x"] * sw)
            y = int(msg["y"] * sh)
            btn = msg.get("btn", "left")
            pyautogui.click(x, y, button=btn)
        elif cmd == "dblclick":
            x = int(msg["x"] * sw)
            y = int(msg["y"] * sh)
            pyautogui.doubleClick(x, y)
        elif cmd == "rightclick":
            x = int(msg["x"] * sw)
            y = int(msg["y"] * sh)
            pyautogui.rightClick(x, y)
        elif cmd == "scroll":
            x = int(msg["x"] * sw)
            y = int(msg["y"] * sh)
            pyautogui.scroll(int(msg.get("delta", 3)), x, y)
        elif cmd == "key":
            pyautogui.press(msg["key"])
        elif cmd == "hotkey":
            pyautogui.hotkey(*msg["keys"])
        elif cmd == "type":
            pyautogui.typewrite(msg["text"], interval=0.02)
        elif cmd == "screenshot":
            pass  # already streaming
    except Exception as e:
        logger.error("Command error: %s", e)


# ── Self-contained mobile UI ──────────────────────────────────────────────────

_REMOTE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover">
<title>JARVIS Remote</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#020b18; color:#00d4ff; font-family:'Courier New',monospace; overflow:hidden; touch-action:none; }

#header {
  height:44px; background:rgba(4,22,40,0.95);
  border-bottom:1px solid rgba(0,212,255,0.3);
  display:flex; align-items:center; justify-content:space-between;
  padding:0 12px; position:fixed; top:0; left:0; right:0; z-index:100;
}
#header span { font-size:11px; letter-spacing:0.2em; }
#status { width:8px; height:8px; border-radius:50%; background:#ff3333; }
#status.on { background:#00ff88; box-shadow:0 0 6px #00ff88; }

#screen-wrap {
  position:fixed; top:44px; left:0; right:0; bottom:80px;
  display:flex; align-items:center; justify-content:center;
  overflow:hidden;
}
#screen {
  max-width:100%; max-height:100%;
  object-fit:contain; display:block;
  border:1px solid rgba(0,212,255,0.2);
  cursor:crosshair;
}

#toolbar {
  position:fixed; bottom:0; left:0; right:0; height:80px;
  background:rgba(2,8,20,0.97); border-top:1px solid rgba(0,212,255,0.2);
  display:flex; align-items:center; justify-content:space-around; padding:0 8px;
  gap:6px;
}

.btn {
  flex:1; height:52px; border:1px solid rgba(0,212,255,0.35);
  background:rgba(0,212,255,0.06); color:#00d4ff;
  border-radius:6px; font-size:10px; letter-spacing:0.1em;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:3px; cursor:pointer; -webkit-tap-highlight-color:transparent;
  font-family:'Courier New',monospace;
}
.btn:active { background:rgba(0,212,255,0.2); border-color:#00d4ff; }
.btn .icon { font-size:18px; }

#keyboard-wrap {
  position:fixed; bottom:80px; left:0; right:0;
  background:rgba(4,22,40,0.98); border-top:1px solid rgba(0,212,255,0.3);
  padding:10px; display:none; z-index:200;
}
#keyboard-wrap.show { display:block; }
#type-input {
  width:100%; background:#020b18; border:1px solid rgba(0,212,255,0.3);
  color:#00d4ff; padding:10px; font-size:14px; border-radius:4px;
  font-family:'Courier New',monospace; outline:none;
}
#send-text {
  margin-top:8px; width:100%; padding:10px;
  background:rgba(0,212,255,0.1); border:1px solid rgba(0,212,255,0.4);
  color:#00d4ff; font-size:12px; border-radius:4px; cursor:pointer;
  letter-spacing:0.15em;
}

.fps { position:fixed; top:52px; right:8px; font-size:9px; color:rgba(0,212,255,0.4); }
</style>
</head>
<body>

<div id="header">
  <span>⚡ JARVIS REMOTE</span>
  <div style="display:flex;align-items:center;gap:6px">
    <span id="fps-label" style="font-size:9px;color:rgba(0,212,255,0.5)">--fps</span>
    <div id="status"></div>
  </div>
</div>

<div id="screen-wrap">
  <img id="screen" src="" alt="Connecting..." />
</div>

<div id="keyboard-wrap" id="kb">
  <input type="text" id="type-input" placeholder="Type text to send to PC..." autocomplete="off" />
  <button id="send-text" onclick="sendText()">SEND TEXT ↑</button>
</div>

<div id="toolbar">
  <div class="btn" onclick="sendKey('escape')"><span class="icon">⎋</span><span>ESC</span></div>
  <div class="btn" onclick="sendKey('tab')"><span class="icon">⇥</span><span>TAB</span></div>
  <div class="btn" onclick="sendHotkey(['ctrl','c'])"><span class="icon">⌨</span><span>COPY</span></div>
  <div class="btn" onclick="sendHotkey(['ctrl','v'])"><span class="icon">📋</span><span>PASTE</span></div>
  <div class="btn" onclick="toggleKb()"><span class="icon">🔤</span><span>TYPE</span></div>
  <div class="btn" onclick="sendHotkey(['win'])"><span class="icon">⊞</span><span>WIN</span></div>
  <div class="btn" onclick="sendHotkey(['alt','f4'])"><span class="icon">✕</span><span>CLOSE</span></div>
</div>

<script>
const host = window.location.host;
let ws, lastFrameTime = 0, frameCount = 0;
const screen = document.getElementById('screen');
const status = document.getElementById('status');
const fpsLabel = document.getElementById('fps-label');
const kbWrap = document.getElementById('keyboard-wrap');
let screenW = 1920, screenH = 1080;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${host}/remote/ws`);
  ws.binaryType = 'blob';

  ws.onopen = () => {
    status.classList.add('on');
    console.log('Remote connected');
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'frame') {
      screen.src = 'data:image/jpeg;base64,' + msg.data;
      screenW = msg.w; screenH = msg.h;
      frameCount++;
      const now = Date.now();
      if (now - lastFrameTime >= 1000) {
        fpsLabel.textContent = frameCount + 'fps';
        frameCount = 0;
        lastFrameTime = now;
      }
    }
  };

  ws.onclose = () => {
    status.classList.remove('on');
    setTimeout(connect, 2000);
  };
}

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// Touch → mouse mapping
let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
let isDragging = false;

function getRelPos(e, el) {
  const rect = el.getBoundingClientRect();
  const touch = e.touches ? e.touches[0] : e;
  return {
    x: (touch.clientX - rect.left) / rect.width,
    y: (touch.clientY - rect.top) / rect.height,
  };
}

screen.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const pos = getRelPos(e, screen);
  touchStartX = pos.x; touchStartY = pos.y;
  touchStartTime = Date.now();
  isDragging = false;
}, {passive: false});

screen.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const pos = getRelPos(e, screen);
  isDragging = true;
  send({cmd:'move', x:pos.x, y:pos.y});
}, {passive: false});

screen.addEventListener('touchend', (e) => {
  e.preventDefault();
  const dur = Date.now() - touchStartTime;
  if (!isDragging && dur < 300) {
    const pos = getRelPos({clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY}, screen);
    send({cmd:'click', x:touchStartX, y:touchStartY});
  }
}, {passive: false});

// Long press = right click
let longPressTimer;
screen.addEventListener('touchstart', (e) => {
  longPressTimer = setTimeout(() => {
    const pos = getRelPos(e, screen);
    send({cmd:'rightclick', x:pos.x, y:pos.y});
    navigator.vibrate && navigator.vibrate(50);
  }, 600);
});
screen.addEventListener('touchend', () => clearTimeout(longPressTimer));
screen.addEventListener('touchmove', () => clearTimeout(longPressTimer));

// Pinch scroll
let lastY2 = null;
screen.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const y2 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    if (lastY2 !== null) {
      const delta = Math.sign(y2 - lastY2) * 3;
      const pos = getRelPos(e, screen);
      send({cmd:'scroll', x:pos.x, y:pos.y, delta});
    }
    lastY2 = y2;
  }
}, {passive: false});
screen.addEventListener('touchend', () => { lastY2 = null; });

function sendKey(key) { send({cmd:'key', key}); }
function sendHotkey(keys) { send({cmd:'hotkey', keys}); }
function toggleKb() { kbWrap.classList.toggle('show'); if(kbWrap.classList.contains('show')) document.getElementById('type-input').focus(); }
function sendText() {
  const text = document.getElementById('type-input').value;
  if (text) { send({cmd:'type', text}); document.getElementById('type-input').value = ''; kbWrap.classList.remove('show'); }
}

connect();
</script>
</body>
</html>"""
