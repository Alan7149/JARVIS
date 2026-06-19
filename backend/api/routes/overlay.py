"""Fully standalone JARVIS HUD — no React, pure HTML/CSS/JS."""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.get("/obs-overlay", response_class=HTMLResponse)
async def obs_overlay():
    """
    JARVIS HUD for OBS Browser Source. Completely self-contained.
    OBS: Sources → + → Browser → http://localhost:8000/obs-overlay
         Width: 1920, Height: 1080, check 'Transparent background'
    """
    return HTMLResponse(content=_OBS_HTML)


_OBS_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>JARVIS HUD</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:transparent;font-family:'Orbitron',monospace}

/* ── Scanline ── */
.scanline{position:fixed;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent,rgba(0,212,255,.7),transparent);
  animation:scan 7s linear infinite;pointer-events:none;z-index:999;
  box-shadow:0 0 10px rgba(0,212,255,.5)}
@keyframes scan{0%{top:-2px;opacity:0}5%{opacity:1}95%{opacity:1}100%{top:1082px;opacity:0}}

/* ── Arc reactor ── */
.arc-wrap{position:fixed;top:20px;left:24px;
  background:rgba(2,8,20,.8);border:1px solid rgba(0,212,255,.3);
  padding:12px 20px;display:flex;align-items:center;gap:14px;
  backdrop-filter:blur(6px)}
.arc-wrap::before,.arc-wrap::after{content:'';position:absolute;width:12px;height:12px;border-color:#00d4ff;border-style:solid;opacity:.7}
.arc-wrap::before{top:-1px;left:-1px;border-width:2px 0 0 2px}
.arc-wrap::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}

.arc-svg{overflow:visible}
.ring1{animation:spin1 8s linear infinite;transform-origin:center}
.ring2{animation:spin2 5s linear infinite;transform-origin:center}
.ring3{animation:spin3 12s linear infinite reverse;transform-origin:center}
.core{animation:pulse 2s ease-in-out infinite}
@keyframes spin1{to{transform:rotate(360deg)}}
@keyframes spin2{to{transform:rotate(-360deg)}}
@keyframes spin3{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1;filter:drop-shadow(0 0 4px #00d4ff)}50%{opacity:.7;filter:drop-shadow(0 0 14px #00d4ff)}}

.brand-title{font-size:22px;font-weight:900;color:#00d4ff;
  letter-spacing:.35em;text-shadow:0 0 20px rgba(0,212,255,.9)}
.brand-sub{font-size:7px;color:rgba(0,212,255,.55);letter-spacing:.3em;margin-top:3px}

/* ── Rings panel (top-right) ── */
.vitals{position:fixed;top:20px;right:24px;
  background:rgba(2,8,20,.8);border:1px solid rgba(0,212,255,.25);
  padding:14px 22px;display:flex;gap:22px;align-items:center;
  backdrop-filter:blur(6px)}
.vitals::before,.vitals::after{content:'';position:absolute;width:12px;height:12px;border-color:#00d4ff;border-style:solid;opacity:.7}
.vitals::before{top:-1px;left:-1px;border-width:2px 0 0 2px}
.vitals::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}

.ring-wrap{display:flex;flex-direction:column;align-items:center;gap:5px}
.ring-label{font-size:8px;color:rgba(0,212,255,.5);letter-spacing:.15em}
.ring-svg{overflow:visible}

/* ── Clock (bottom-left) ── */
.clock{position:fixed;bottom:24px;left:24px;
  background:rgba(2,8,20,.8);border:1px solid rgba(0,212,255,.2);
  padding:12px 18px;backdrop-filter:blur(6px)}
.clock::before,.clock::after{content:'';position:absolute;width:12px;height:12px;border-color:#00d4ff;border-style:solid;opacity:.7}
.clock::before{top:-1px;left:-1px;border-width:2px 0 0 2px}
.clock::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}
.clock-time{font-size:32px;font-weight:900;color:#00d4ff;
  letter-spacing:.1em;text-shadow:0 0 12px rgba(0,212,255,.7)}
.clock-date{font-size:8px;color:rgba(0,212,255,.5);letter-spacing:.2em;margin-top:4px}

/* ── Status bar (bottom-right) ── */
.statusbar{position:fixed;bottom:24px;right:24px;
  background:rgba(2,8,20,.8);border:1px solid rgba(0,212,255,.2);
  padding:12px 18px;display:flex;gap:18px;align-items:center;
  backdrop-filter:blur(6px)}
.statusbar::before,.statusbar::after{content:'';position:absolute;width:12px;height:12px;border-color:#00d4ff;border-style:solid;opacity:.7}
.statusbar::before{top:-1px;left:-1px;border-width:2px 0 0 2px}
.statusbar::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}
.stat{text-align:center}
.stat-val{font-size:13px;color:#00d4ff;font-weight:700;letter-spacing:.05em}
.stat-lbl{font-size:7px;color:rgba(0,212,255,.45);letter-spacing:.15em;margin-top:2px}
.divider{width:1px;height:28px;background:rgba(0,212,255,.15)}

/* ── JARVIS speaking waveform (center bottom) ── */
.wave-bar-wrap{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
  display:none;align-items:flex-end;gap:3px;height:40px}
.wave-bar-wrap.speaking{display:flex}
.wave-bar{width:4px;background:#00d4ff;border-radius:2px;
  box-shadow:0 0 6px #00d4ff;min-height:4px}

/* ── Mode badge ── */
.mode-badge{position:fixed;top:20px;left:50%;transform:translateX(-50%);
  background:rgba(2,8,20,.85);border:1px solid rgba(0,212,255,.3);
  padding:6px 18px;font-size:9px;color:rgba(0,212,255,.7);
  letter-spacing:.25em;backdrop-filter:blur(4px)}

/* ── Bottom center glow line ── */
.glow-line{position:fixed;bottom:0;left:30%;right:30%;height:2px;
  background:linear-gradient(90deg,transparent,rgba(0,212,255,.5),transparent)}
</style>
</head>
<body>
<div class="scanline"></div>

<!-- Arc reactor + branding -->
<div class="arc-wrap">
  <svg class="arc-svg" width="52" height="52" viewBox="0 0 52 52">
    <defs>
      <radialGradient id="cg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#afffff"/>
        <stop offset="50%" stop-color="#00d4ff"/>
        <stop offset="100%" stop-color="#0066cc" stop-opacity=".6"/>
      </radialGradient>
    </defs>
    <g class="ring1" style="transform-origin:26px 26px">
      <circle cx="26" cy="26" r="23" fill="none" stroke="rgba(0,212,255,.3)" stroke-width="1"/>
      <line x1="26" y1="3" x2="26" y2="9" stroke="#00d4ff" stroke-width="1.5"/>
      <line x1="26" y1="43" x2="26" y2="49" stroke="#00d4ff" stroke-width="1.5"/>
      <line x1="3" y1="26" x2="9" y2="26" stroke="#00d4ff" stroke-width="1.5"/>
      <line x1="43" y1="26" x2="49" y2="26" stroke="#00d4ff" stroke-width="1.5"/>
    </g>
    <g class="ring2" style="transform-origin:26px 26px">
      <circle cx="26" cy="26" r="16" fill="none" stroke="rgba(0,212,255,.5)" stroke-width="1.5" stroke-dasharray="5 3"/>
    </g>
    <g class="ring3" style="transform-origin:26px 26px">
      <circle cx="26" cy="26" r="10" fill="rgba(0,80,140,.2)" stroke="rgba(0,212,255,.7)" stroke-width="1.5"/>
    </g>
    <circle class="core" cx="26" cy="26" r="5" fill="url(#cg)"/>
    <circle cx="26" cy="26" r="2" fill="white" opacity=".9"/>
  </svg>
  <div>
    <div class="brand-title">JARVIS</div>
    <div class="brand-sub" id="brand-sub">ALL SYSTEMS NOMINAL</div>
  </div>
</div>

<!-- Vitals rings -->
<div class="vitals" id="vitals">
  <div class="ring-wrap"><canvas class="ring-svg" id="ring-cpu" width="80" height="80"></canvas><div class="ring-label">CPU %</div></div>
  <div class="ring-wrap"><canvas class="ring-svg" id="ring-ram" width="80" height="80"></canvas><div class="ring-label">RAM %</div></div>
  <div class="ring-wrap"><canvas class="ring-svg" id="ring-bat" width="80" height="80"></canvas><div class="ring-label">BAT %</div></div>
</div>

<!-- Clock -->
<div class="clock">
  <div class="clock-time" id="clock-time">00:00:00</div>
  <div class="clock-date" id="clock-date">LOADING...</div>
</div>

<!-- Status bar -->
<div class="statusbar">
  <div class="stat"><div class="stat-val" id="stat-mode">IDLE</div><div class="stat-lbl">MODE</div></div>
  <div class="divider"></div>
  <div class="stat"><div class="stat-val" id="stat-net" style="color:#00ff88">ONLINE</div><div class="stat-lbl">NETWORK</div></div>
  <div class="divider"></div>
  <div class="stat"><div class="stat-val" style="color:#00ff88">NOMINAL</div><div class="stat-lbl">SYSTEM</div></div>
</div>

<!-- Speaking waveform -->
<div class="wave-bar-wrap" id="wave">
  <div class="wave-bar" id="wb0"></div>
  <div class="wave-bar" id="wb1"></div>
  <div class="wave-bar" id="wb2"></div>
  <div class="wave-bar" id="wb3"></div>
  <div class="wave-bar" id="wb4"></div>
  <div class="wave-bar" id="wb5"></div>
  <div class="wave-bar" id="wb6"></div>
  <div class="wave-bar" id="wb7"></div>
  <div class="wave-bar" id="wb8"></div>
</div>

<div class="glow-line"></div>

<script>
// ── Clock ──────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date()
  document.getElementById('clock-time').textContent =
    now.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
  document.getElementById('clock-date').textContent =
    now.toLocaleDateString('en',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase()
}
setInterval(updateClock, 1000); updateClock()

// ── Ring drawing ───────────────────────────────────────────────────
function drawRing(canvasId, value, color) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const cx = 40, cy = 40, r = 30, lw = 5
  ctx.clearRect(0, 0, 80, 80)
  // Track
  ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,Math.PI*1.5)
  ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=lw; ctx.stroke()
  // Fill
  const end = -Math.PI/2 + (value/100)*Math.PI*2
  ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,end)
  ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.lineCap='round'
  ctx.shadowColor=color; ctx.shadowBlur=8; ctx.stroke()
  ctx.shadowBlur=0
  // Label
  ctx.fillStyle=color; ctx.font='bold 14px Orbitron,monospace'
  ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(Math.round(value), cx, cy)
}

function getColor(v, warn=70, crit=85) {
  if (v>crit) return '#ff3333'; if (v>warn) return '#ff9900'; return '#00d4ff'
}

let cpu=0, ram=0, bat=100
function renderRings() {
  drawRing('ring-cpu', cpu, getColor(cpu))
  drawRing('ring-ram', ram, getColor(ram))
  drawRing('ring-bat', bat, bat<20 ? '#ff3333' : bat<50 ? '#ff9900' : '#00ff88')
}
renderRings()

// ── WebSocket ──────────────────────────────────────────────────────
function connect() {
  const proto = location.protocol==='https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/ws`)

  ws.onmessage = (e) => {
    try {
      const {event, data} = JSON.parse(e.data)
      if (event === 'system_status') {
        cpu = data.cpu_percent || 0
        ram = data.ram_percent || 0
        bat = data.battery?.percent ?? 100
        renderRings()
        document.getElementById('brand-sub').textContent =
          `CPU ${cpu.toFixed(0)}%  RAM ${ram.toFixed(0)}%  BAT ${bat.toFixed(0)}%`
      }
      if (event === 'context_change') {
        document.getElementById('stat-mode').textContent = (data.mode || 'IDLE').toUpperCase()
      }
      if (event === 'jarvis_speaking') {
        setWave(data.speaking)
      }
    } catch(e) {}
  }

  ws.onclose = () => setTimeout(connect, 3000)
}
connect()

// ── Waveform animation ─────────────────────────────────────────────
let waveAnim = null
function setWave(active) {
  const el = document.getElementById('wave')
  if (active) {
    el.classList.add('speaking')
    if (!waveAnim) waveAnim = setInterval(animWave, 80)
  } else {
    el.classList.remove('speaking')
    if (waveAnim) { clearInterval(waveAnim); waveAnim = null }
    for (let i=0;i<9;i++) document.getElementById('wb'+i).style.height='4px'
  }
}
function animWave() {
  for (let i=0;i<9;i++) {
    const h = 6 + Math.random()*34
    document.getElementById('wb'+i).style.height = h+'px'
  }
}
</script>
</body>
</html>"""
