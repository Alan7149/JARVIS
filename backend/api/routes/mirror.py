"""
JARVIS Native Screen Mirror
Uses WebRTC + iOS Safari getDisplayMedia() — no third-party apps.

Flow:
  1. iPhone opens https://<YOUR_TAILSCALE_IP>:8000/mirror/phone in Safari
  2. Taps "Start Mirroring" — iOS asks which screen/app to share
  3. Selects screen — stream begins
  4. JARVIS dashboard at /mirror/view shows the live feed
  5. Works over Tailscale or local WiFi
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import asyncio, json, logging

router = APIRouter()
logger = logging.getLogger("jarvis.mirror")

# Connected WebSocket clients
_phone_ws: WebSocket | None = None
_viewer_ws: WebSocket | None = None
_lock = asyncio.Lock()


@router.get("/mirror/phone", response_class=HTMLResponse)
async def mirror_phone():
    """iPhone opens this in Safari — captures screen and streams via WebRTC."""
    return HTMLResponse(_PHONE_HTML)


@router.get("/mirror/view", response_class=HTMLResponse)
async def mirror_view():
    """Viewer page — displayed in JARVIS dashboard to see iPhone screen."""
    return HTMLResponse(_VIEWER_HTML)


@router.websocket("/mirror/ws/{role}")
async def mirror_ws(websocket: WebSocket, role: str):
    """
    WebRTC signaling server.
    role = 'phone'  — the iPhone sender
    role = 'viewer' — the JARVIS dashboard viewer
    """
    global _phone_ws, _viewer_ws
    await websocket.accept()
    logger.info("Mirror WS connected: %s", role)

    async with _lock:
        if role == "phone":
            _phone_ws = websocket
        else:
            _viewer_ws = websocket

    # Notify both sides that a peer connected
    try:
        peer = _viewer_ws if role == "phone" else _phone_ws
        if peer:
            await peer.send_json({"type": "peer_connected", "role": role})

        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            # Forward signaling messages to the other peer
            if peer and peer.client_state.value == 1:  # CONNECTED
                await peer.send_text(data)
            else:
                # Peer not connected yet — find current peer
                peer = _viewer_ws if role == "phone" else _phone_ws
                if peer:
                    try:
                        await peer.send_text(data)
                    except Exception:
                        pass

    except WebSocketDisconnect:
        logger.info("Mirror WS disconnected: %s", role)
        async with _lock:
            if role == "phone":
                _phone_ws = None
                if _viewer_ws:
                    try:
                        await _viewer_ws.send_json({"type": "phone_disconnected"})
                    except Exception:
                        pass
            else:
                _viewer_ws = None
    except Exception as e:
        logger.error("Mirror WS error [%s]: %s", role, e)


# ── iPhone Sender Page ────────────────────────────────────────────────────────

_PHONE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>JARVIS Mirror</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{background:#020b18;color:#00d4ff;font-family:'Courier New',monospace;
     display:flex;flex-direction:column;align-items:center;justify-content:center;
     min-height:100vh;padding:24px;text-align:center;gap:20px}
.logo{font-size:28px;font-weight:900;letter-spacing:.3em;
      text-shadow:0 0 20px rgba(0,212,255,.8)}
.sub{font-size:10px;color:rgba(0,212,255,.5);letter-spacing:.2em}
.status{font-size:12px;padding:8px 20px;border:1px solid rgba(0,212,255,.3);
        border-radius:20px;letter-spacing:.1em;min-width:220px}
.btn{width:100%;max-width:300px;padding:16px;border-radius:10px;font-size:14px;
     font-family:'Courier New',monospace;font-weight:700;letter-spacing:.1em;
     border:none;cursor:pointer;transition:all .2s}
.btn-start{background:rgba(0,212,255,.15);border:2px solid rgba(0,212,255,.6);
           color:#00d4ff;font-size:16px}
.btn-start:active{background:rgba(0,212,255,.3)}
.btn-stop{background:rgba(255,51,51,.1);border:2px solid rgba(255,51,51,.4);color:#ff3333}
.preview{width:100%;max-width:300px;border-radius:10px;border:2px solid rgba(0,212,255,.3);
         background:#000;display:none;aspect-ratio:9/19.5}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;
     vertical-align:middle}
.dot-green{background:#00ff88;box-shadow:0 0 6px #00ff88;animation:p 1.5s ease infinite}
.dot-red{background:#ff3333}
.dot-yellow{background:#ff9900;animation:p 1s ease infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
.steps{max-width:300px;text-align:left;font-size:10px;color:rgba(0,212,255,.6);
       line-height:1.8;border:1px solid rgba(0,212,255,.15);border-radius:8px;padding:12px}
</style>
</head>
<body>
<div class="logo">JARVIS</div>
<div class="sub">SCREEN MIRROR</div>

<div class="status" id="status">
  <span class="dot dot-yellow"></span>CONNECTING...
</div>

<video id="preview" class="preview" autoplay muted playsinline></video>

<button class="btn btn-start" id="start-btn" onclick="startMirror()" style="display:none">
  📱 START SCREEN SHARE
</button>
<button class="btn btn-stop" id="stop-btn" onclick="stopMirror()" style="display:none">
  ⏹ STOP SHARING
</button>

<div class="steps" id="steps">
  <div>1. Tap <strong style="color:#00d4ff">START SCREEN SHARE</strong></div>
  <div>2. iOS asks what to share → select <strong style="color:#00d4ff">Screen</strong></div>
  <div>3. Your screen streams to JARVIS live</div>
  <div style="margin-top:6px;color:rgba(0,212,255,.4);font-size:9px">Requires iOS 16.4+ · Safari only</div>
</div>

<script>
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/mirror/ws/phone';
let ws, pc, stream;

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    setStatus('yellow', 'WAITING FOR VIEWER...');
    document.getElementById('start-btn').style.display = 'block';
  };
  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'peer_connected') {
      setStatus('green', 'JARVIS CONNECTED');
    } else if (msg.type === 'answer' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg));
    } else if (msg.type === 'candidate' && pc) {
      try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch(e) {}
    }
  };
  ws.onclose = () => { setStatus('red', 'DISCONNECTED'); setTimeout(connect, 3000); };
  ws.onerror = () => ws.close();
}

async function startMirror() {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 390, frameRate: 15, cursor: 'always' },
      audio: false
    });
    document.getElementById('preview').srcObject = stream;
    document.getElementById('preview').style.display = 'block';
    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('stop-btn').style.display = 'block';
    document.getElementById('steps').style.display = 'none';
    setStatus('green', 'STREAMING TO JARVIS');

    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = e => {
      if (e.candidate) ws.send(JSON.stringify({type:'candidate',candidate:e.candidate}));
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected') setStatus('green', 'LIVE — JARVIS SEES YOUR SCREEN');
      if (pc.iceConnectionState === 'disconnected') setStatus('yellow', 'RECONNECTING...');
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({type:'offer', sdp: offer.sdp}));

    stream.getVideoTracks()[0].onended = () => stopMirror();
  } catch(e) {
    alert('Could not start screen share: ' + e.message + '\\n\\nMake sure you are using Safari on iOS 16.4+');
  }
}

function stopMirror() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (pc) pc.close();
  document.getElementById('preview').style.display = 'none';
  document.getElementById('preview').srcObject = null;
  document.getElementById('start-btn').style.display = 'block';
  document.getElementById('stop-btn').style.display = 'none';
  document.getElementById('steps').style.display = 'block';
  setStatus('yellow', 'STOPPED');
}

function setStatus(color, text) {
  document.getElementById('status').innerHTML =
    '<span class="dot dot-' + color + '"></span>' + text;
}

connect();
</script>
</body>
</html>"""


# ── JARVIS Viewer Page ────────────────────────────────────────────────────────

_VIEWER_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JARVIS Mirror — Viewer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#020b18;display:flex;flex-direction:column;align-items:center;
     justify-content:center;min-height:100vh;font-family:'Courier New',monospace}
.header{position:fixed;top:0;left:0;right:0;height:36px;background:rgba(4,22,40,.95);
        border-bottom:1px solid rgba(0,212,255,.2);display:flex;align-items:center;
        justify-content:space-between;padding:0 16px;z-index:100}
.title{font-size:11px;color:#00d4ff;letter-spacing:.2em;font-weight:700}
.status-badge{font-size:9px;padding:3px 10px;border-radius:10px;letter-spacing:.1em}
.live{background:rgba(0,255,136,.1);border:1px solid rgba(0,255,136,.3);color:#00ff88}
.wait{background:rgba(255,153,0,.1);border:1px solid rgba(255,153,0,.3);color:#ff9900}
.off{background:rgba(255,51,51,.1);border:1px solid rgba(255,51,51,.3);color:#ff3333}

#screen-wrap{margin-top:36px;width:100%;height:calc(100vh - 36px);
             display:flex;align-items:center;justify-content:center;
             background:#020b18;position:relative;overflow:hidden}
video{max-width:100%;max-height:100%;border:2px solid rgba(0,212,255,.2);
      border-radius:4px;box-shadow:0 0 30px rgba(0,212,255,.1)}

.placeholder{text-align:center;color:rgba(0,212,255,.4)}
.ph-icon{font-size:48px;margin-bottom:12px}
.ph-title{font-size:14px;letter-spacing:.2em;margin-bottom:8px}
.ph-url{font-size:11px;color:rgba(0,212,255,.6);padding:8px 16px;
        border:1px solid rgba(0,212,255,.2);border-radius:4px;
        background:rgba(0,0,0,.3);cursor:pointer}
.ph-hint{font-size:9px;color:rgba(0,212,255,.3);margin-top:10px;letter-spacing:.1em}

/* Scan line */
.scan{position:fixed;top:36px;left:0;right:0;height:1px;pointer-events:none;
      background:linear-gradient(90deg,transparent,rgba(0,212,255,.5),transparent);
      animation:scan 6s linear infinite;z-index:50}
@keyframes scan{0%{top:36px;opacity:0}5%{opacity:1}95%{opacity:1}100%{top:100vh;opacity:0}}
</style>
</head>
<body>
<div class="scan"></div>
<div class="header">
  <div class="title">⚡ JARVIS SCREEN MIRROR</div>
  <div class="status-badge wait" id="badge">WAITING FOR iPHONE</div>
</div>
<div id="screen-wrap">
  <div class="placeholder" id="placeholder">
    <div class="ph-icon">📱</div>
    <div class="ph-title">NO STREAM</div>
    <div class="ph-url" onclick="copyUrl()" id="phone-url">
      http://LOADING.../mirror/phone
    </div>
    <div class="ph-hint">OPEN ABOVE URL IN SAFARI ON iPHONE</div>
    <div class="ph-hint" style="margin-top:6px;color:rgba(255,153,0,.5)">Requires iOS 16.4+</div>
  </div>
  <video id="remote-video" autoplay playsinline style="display:none"></video>
</div>

<script>
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/mirror/ws/viewer';
const PHONE_URL = 'http://' + location.hostname + ':' + location.port + '/mirror/phone';
document.getElementById('phone-url').textContent = PHONE_URL;

let ws, pc;

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => setBadge('wait', 'WAITING FOR iPHONE');
  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'peer_connected') {
      setBadge('wait', 'iPHONE CONNECTED — STARTING...');
    } else if (msg.type === 'phone_disconnected') {
      stopReceiving();
    } else if (msg.type === 'offer') {
      await handleOffer(msg);
    } else if (msg.type === 'candidate' && pc) {
      try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch(e) {}
    }
  };
  ws.onclose = () => { setBadge('off', 'RECONNECTING...'); setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
}

async function handleOffer(msg) {
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  pc.ontrack = (e) => {
    const video = document.getElementById('remote-video');
    video.srcObject = e.streams[0];
    video.style.display = 'block';
    document.getElementById('placeholder').style.display = 'none';
    setBadge('live', 'LIVE');
  };
  pc.onicecandidate = e => {
    if (e.candidate) ws.send(JSON.stringify({type:'candidate',candidate:e.candidate}));
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'disconnected') stopReceiving();
  };
  await pc.setRemoteDescription(new RTCSessionDescription({type:'offer', sdp:msg.sdp}));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({type:'answer', sdp:answer.sdp}));
}

function stopReceiving() {
  if (pc) { pc.close(); pc = null; }
  const video = document.getElementById('remote-video');
  video.style.display = 'none';
  video.srcObject = null;
  document.getElementById('placeholder').style.display = 'block';
  setBadge('wait', 'STREAM ENDED');
}

function setBadge(cls, text) {
  const b = document.getElementById('badge');
  b.className = 'status-badge ' + cls;
  b.textContent = text;
}

function copyUrl() {
  navigator.clipboard.writeText(PHONE_URL).then(() => {
    document.getElementById('phone-url').textContent = 'COPIED!';
    setTimeout(() => document.getElementById('phone-url').textContent = PHONE_URL, 2000);
  });
}

connect();
</script>
</body>
</html>"""
