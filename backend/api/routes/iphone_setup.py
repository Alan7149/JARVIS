"""
JARVIS iPhone Setup Wizard
Open https://<YOUR_TAILSCALE_IP>:8000/iphone-setup on your iPhone.
One-tap setup for all shortcuts, Tailscale, ntfy, everything.
"""
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from core.config import settings

router = APIRouter()

# Configure these in backend/.env (TAILSCALE_IP, LOCAL_IP, API_KEY, NTFY_PUSH_TOPIC)
TAILSCALE_IP = settings.TAILSCALE_IP or "YOUR_TAILSCALE_IP"
LOCAL_IP = settings.LOCAL_IP or "YOUR_LOCAL_IP"
JARVIS_IP = TAILSCALE_IP
API_KEY = settings.API_KEY
WEBHOOK = f"http://{JARVIS_IP}:8000/api/webhooks/phone"
NTFY_TOPIC = settings.NTFY_PUSH_TOPIC

SHORTCUTS_DIR = Path(__file__).parent.parent.parent / "static" / "shortcuts"


@router.get("/api/shortcuts/{filename}")
async def serve_shortcut(filename: str):
    """
    Serve .shortcut files with correct MIME type.
    When opened in Safari on iPhone, iOS prompts to open in Shortcuts app.
    """
    path = SHORTCUTS_DIR / filename
    if not path.exists() or not filename.endswith(".shortcut"):
        from fastapi import HTTPException
        raise HTTPException(404, detail=f"Shortcut not found: {filename}")
    return FileResponse(
        path,
        # 'application/shortcut' is the MIME type iOS recognises for Shortcuts files
        media_type="application/shortcut",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Tell iOS not to cache so it always fetches fresh
            "Cache-Control": "no-cache, no-store",
        }
    )


@router.get("/api/add-shortcut/{shortcut_id}")
async def add_shortcut_page(shortcut_id: str):
    """
    Intermediate page that redirects to the .shortcut file.
    Safari on iPhone will download it and prompt 'Open in Shortcuts'.
    """
    file_url = f"http://{JARVIS_IP}:8000/api/shortcuts/{shortcut_id}.shortcut"
    names = {
        "hey-jarvis": "Hey JARVIS",
        "battery-alert": "JARVIS Battery Alert",
        "arrived-home": "JARVIS Arrived Home",
        "morning-briefing": "JARVIS Morning Briefing",
        "goodnight": "JARVIS Goodnight",
        "driving-mode": "JARVIS Driving Mode",
    }
    name = names.get(shortcut_id, shortcut_id.replace("-", " ").title())
    # Serve a small HTML page that immediately redirects to the file
    # This ensures iOS Safari downloads the file and offers to open in Shortcuts
    return HTMLResponse(content=f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<title>Adding {name}</title>
<style>
body{{background:#020b18;color:#00d4ff;font-family:'Courier New',monospace;
     display:flex;flex-direction:column;align-items:center;justify-content:center;
     min-height:100vh;gap:16px;padding:20px;text-align:center}}
.btn{{display:block;padding:14px 28px;background:rgba(0,212,255,.12);
     border:1.5px solid rgba(0,212,255,.5);color:#00d4ff;border-radius:8px;
     font-size:14px;text-decoration:none;font-family:'Courier New',monospace;
     letter-spacing:.1em;margin-top:8px}}
</style>
<meta http-equiv="refresh" content="1;url={file_url}">
</head><body>
<div style="font-size:28px">📲</div>
<div style="font-size:16px;font-weight:700;letter-spacing:.1em">{name}</div>
<div style="font-size:11px;color:rgba(0,212,255,.6)">Opening in Shortcuts...</div>
<div style="font-size:10px;color:rgba(0,212,255,.4);margin-top:4px">
  Safari will ask to open in Shortcuts — tap <strong style="color:#00ff88">Open</strong>
</div>
<a href="{file_url}" class="btn">📥 TAP HERE IF NOT REDIRECTED</a>
<div style="font-size:9px;color:rgba(0,212,255,.3);margin-top:12px">
  After Shortcuts opens → tap <strong style="color:#ff9900">Add Untrusted Shortcut</strong>
</div>
</body></html>""")


@router.get("/iphone-setup", response_class=HTMLResponse)
async def iphone_setup():
    return HTMLResponse(content=_HTML)


_HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>JARVIS Setup</title>
<style>
:root {{
  --bg: #020b18; --panel: #041628; --border: #0d4a6e;
  --glow: #00d4ff; --green: #00ff88; --warn: #ff9900; --danger: #ff3333;
  --text: #a8d8ea; --muted: #4a7a99;
}}
* {{ margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }}
body {{
  background:var(--bg); color:var(--text); font-family:'Courier New',monospace;
  min-height:100vh; padding-bottom:40px;
}}

/* Header */
.header {{
  background:rgba(4,22,40,.95); border-bottom:1px solid var(--border);
  padding:16px 20px; position:sticky; top:0; z-index:100;
  display:flex; align-items:center; justify-content:space-between;
  backdrop-filter:blur(10px);
}}
.header-left {{ display:flex; align-items:center; gap:10px; }}
.arc {{ width:32px; height:32px; }}
.title {{ font-size:16px; font-weight:700; letter-spacing:.2em; color:var(--glow);
  text-shadow:0 0 10px rgba(0,212,255,.6); }}
.subtitle {{ font-size:9px; color:var(--muted); letter-spacing:.15em; margin-top:2px; }}
.status-pill {{
  display:flex; align-items:center; gap:5px; padding:5px 10px;
  border:1px solid rgba(0,255,136,.3); border-radius:20px;
  font-size:9px; letter-spacing:.1em; color:var(--green);
  background:rgba(0,255,136,.06);
}}
.dot {{ width:6px; height:6px; border-radius:50%; background:var(--green);
  animation:pulse 2s ease-in-out infinite; }}
@keyframes pulse {{ 0%,100% {{ opacity:1 }} 50% {{ opacity:.4 }} }}

/* Steps */
.steps {{ padding:16px; display:flex; flex-direction:column; gap:12px; }}

.step {{
  border:1px solid var(--border); border-radius:8px; overflow:hidden;
  background:var(--panel);
}}
.step-header {{
  display:flex; align-items:center; gap:10px; padding:12px 14px;
  border-bottom:1px solid rgba(13,74,110,.4);
}}
.step-num {{
  width:26px; height:26px; border-radius:50%; border:1.5px solid var(--glow);
  display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:700; color:var(--glow); flex-shrink:0;
}}
.step-num.done {{ background:rgba(0,255,136,.15); border-color:var(--green); color:var(--green); }}
.step-info {{ flex:1; }}
.step-title {{ font-size:12px; font-weight:700; letter-spacing:.1em; color:var(--text); }}
.step-desc {{ font-size:9px; color:var(--muted); margin-top:2px; letter-spacing:.05em; }}
.step-body {{ padding:12px 14px; }}

/* Buttons */
.btn {{
  display:flex; align-items:center; justify-content:center; gap:6px;
  width:100%; padding:12px; border-radius:6px; font-size:12px;
  font-family:'Courier New',monospace; font-weight:700;
  letter-spacing:.1em; text-decoration:none; border:none; cursor:pointer;
  transition:all .15s; margin-bottom:8px;
}}
.btn:last-child {{ margin-bottom:0; }}
.btn-primary {{ background:rgba(0,212,255,.12); border:1.5px solid rgba(0,212,255,.5); color:var(--glow); }}
.btn-primary:active {{ background:rgba(0,212,255,.25); }}
.btn-green {{ background:rgba(0,255,136,.1); border:1.5px solid rgba(0,255,136,.4); color:var(--green); }}
.btn-green:active {{ background:rgba(0,255,136,.2); }}
.btn-warn {{ background:rgba(255,153,0,.1); border:1.5px solid rgba(255,153,0,.4); color:var(--warn); }}

/* Code box */
.code-box {{
  background:rgba(0,0,0,.4); border:1px solid var(--border); border-radius:6px;
  padding:10px; font-size:10px; color:var(--glow); word-break:break-all;
  margin-bottom:8px; position:relative; line-height:1.5;
}}
.copy-btn {{
  position:absolute; top:6px; right:6px; background:rgba(0,212,255,.15);
  border:1px solid rgba(0,212,255,.3); color:var(--glow);
  font-size:9px; padding:3px 8px; border-radius:4px; cursor:pointer;
  font-family:'Courier New',monospace;
}}
.copy-btn.copied {{ background:rgba(0,255,136,.15); border-color:rgba(0,255,136,.3); color:var(--green); }}

/* Shortcut cards */
.sc-grid {{ display:flex; flex-direction:column; gap:8px; }}
.sc-card {{
  border:1px solid var(--border); border-radius:6px; overflow:hidden;
  background:rgba(2,8,20,.6);
}}
.sc-header {{
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 12px; background:rgba(4,22,40,.8);
}}
.sc-left {{ display:flex; align-items:center; gap:8px; }}
.sc-emoji {{ font-size:18px; }}
.sc-name {{ font-size:11px; font-weight:700; color:var(--glow); letter-spacing:.05em; }}
.sc-trigger {{ font-size:8px; color:var(--muted); margin-top:1px; }}
.sc-copy {{
  background:rgba(0,212,255,.1); border:1px solid rgba(0,212,255,.3);
  color:var(--glow); font-size:9px; padding:5px 10px; border-radius:4px;
  font-family:'Courier New',monospace; cursor:pointer; flex-shrink:0;
}}
.sc-copy.copied {{ background:rgba(0,255,136,.1); border-color:rgba(0,255,136,.3); color:var(--green); }}
.sc-body {{
  padding:8px 12px;
  font-size:9px; color:var(--muted); line-height:1.6;
  border-top:1px solid rgba(13,74,110,.3);
  white-space:pre-wrap;
}}

/* Progress */
.progress-bar {{
  height:3px; background:rgba(13,74,110,.3); border-radius:2px; margin:0 16px 4px;
}}
.progress-fill {{
  height:100%; border-radius:2px;
  background:linear-gradient(90deg,#0044aa,var(--glow));
  transition:width .3s ease;
  box-shadow:0 0 6px var(--glow);
}}
.progress-label {{ font-size:9px; color:var(--muted); text-align:center; margin-bottom:12px; letter-spacing:.1em; }}

/* Divider */
.divider {{ height:1px; background:rgba(13,74,110,.3); margin:8px 0; }}

/* Shortcut install cards */
.sc-install-card {{
  border:1px solid var(--border); border-radius:8px; overflow:hidden;
  background:rgba(4,22,40,.6); transition:border-color .3s;
}}
.sc-install-card.done {{ border-color:rgba(0,255,136,.4); }}
.sc-install-header {{
  display:flex; align-items:center; gap:8px; padding:10px 12px;
  border-bottom:1px solid rgba(13,74,110,.3);
}}
.sc-install-emoji {{ font-size:22px; flex-shrink:0; }}
.sc-install-info {{ flex:1; }}
.sc-install-name {{ font-size:12px; font-weight:700; color:var(--glow); }}
.sc-install-trigger {{ font-size:8px; color:var(--muted); margin-top:2px; line-height:1.3; }}
.sc-install-badge {{
  font-size:8px; padding:3px 8px; border-radius:10px; letter-spacing:.08em;
  background:rgba(0,212,255,.08); border:1px solid rgba(0,212,255,.2); color:var(--glow);
  flex-shrink:0;
}}
.sc-install-badge.done {{ background:rgba(0,255,136,.1); border-color:rgba(0,255,136,.3); color:var(--green); }}
.sc-install-btn {{ margin:10px 12px 0; width:calc(100% - 24px); }}
.sc-siri-hint {{ font-size:8px; color:var(--muted); padding:8px 12px 10px; line-height:1.4; }}

/* Badge */
.badge {{
  display:inline-flex; align-items:center; gap:4px; padding:2px 8px;
  border-radius:10px; font-size:8px; letter-spacing:.1em;
}}
.badge-green {{ background:rgba(0,255,136,.1); border:1px solid rgba(0,255,136,.3); color:var(--green); }}
.badge-blue {{ background:rgba(0,212,255,.08); border:1px solid rgba(0,212,255,.2); color:var(--glow); }}

.info-row {{
  display:flex; justify-content:space-between; align-items:center;
  padding:6px 0; border-bottom:1px solid rgba(13,74,110,.2); font-size:10px;
}}
.info-row:last-child {{ border:none; }}
.info-label {{ color:var(--muted); }}
.info-value {{ color:var(--glow); font-weight:700; }}
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <!-- Mini arc reactor -->
    <svg class="arc" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(0,212,255,.3)" stroke-width="1"/>
      <circle cx="16" cy="16" r="10" fill="none" stroke="rgba(0,212,255,.5)" stroke-width="1" stroke-dasharray="4 3"/>
      <circle cx="16" cy="16" r="6" fill="rgba(0,80,140,.2)" stroke="rgba(0,212,255,.7)" stroke-width="1.5"/>
      <circle cx="16" cy="16" r="3" fill="#00d4ff" style="filter:drop-shadow(0 0 3px #00d4ff)"/>
    </svg>
    <div>
      <div class="title">JARVIS</div>
      <div class="subtitle">iPHONE SETUP WIZARD</div>
    </div>
  </div>
  <div class="status-pill"><div class="dot"></div>LIVE</div>
</div>

<div class="progress-bar" style="margin-top:12px">
  <div class="progress-fill" id="prog" style="width:0%"></div>
</div>
<div class="progress-label" id="prog-label">0 of 4 steps complete</div>

<div class="steps">

  <!-- STEP 0: Enable Allow Untrusted Shortcuts — MUST do this first -->
  <div class="step" style="border-color:rgba(255,153,0,.5);background:rgba(255,153,0,.04)">
    <div class="step-header" style="border-bottom-color:rgba(255,153,0,.3)">
      <div class="step-num" style="border-color:#ff9900;color:#ff9900">!</div>
      <div class="step-info">
        <div class="step-title" style="color:#ff9900">DO THIS FIRST — ONE-TIME SETTING</div>
        <div class="step-desc">Enable Allow Untrusted Shortcuts in iOS Settings</div>
      </div>
    </div>
    <div class="step-body">
      <div style="font-size:13px;color:var(--text);margin-bottom:12px;line-height:1.6">
        iOS blocks importing shortcuts by default. You need to enable this setting <strong style="color:#ff9900">once</strong>:
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,153,0,.08);border:1px solid rgba(255,153,0,.25);border-radius:6px">
          <span style="font-size:20px">⚙️</span>
          <div style="font-size:11px;line-height:1.5">
            <strong style="color:#ff9900">Settings</strong> <span style="color:var(--muted)">→</span>
            <strong style="color:#ff9900"> Shortcuts</strong> <span style="color:var(--muted)">→</span>
            <strong style="color:#ff9900"> Allow Untrusted Shortcuts</strong>
            <br><span style="color:var(--muted);font-size:9px">Toggle it ON → enter your passcode when prompted</span>
          </div>
        </div>
      </div>
      <a href="prefs:root=SHORTCUTS" class="btn btn-warn">
        ⚙️ OPEN SHORTCUTS SETTINGS
      </a>
      <div style="font-size:9px;color:var(--muted);text-align:center;margin-top:8px">
        If that link doesn't work: Settings → Shortcuts → Allow Untrusted Shortcuts
      </div>
    </div>
  </div>

  <!-- Step 1: Verify connection -->
  <div class="step">
    <div class="step-header">
      <div class="step-num" id="s1-num">1</div>
      <div class="step-info">
        <div class="step-title">VERIFY CONNECTION</div>
        <div class="step-desc">Confirm your iPhone can reach JARVIS</div>
      </div>
    </div>
    <div class="step-body">
      <div class="info-row">
        <span class="info-label">Tailscale IP (anywhere)</span>
        <span class="info-value">{TAILSCALE_IP}</span>
      </div>
      <div class="info-row">
        <span class="info-label">WiFi IP (home only)</span>
        <span class="info-value">{LOCAL_IP}</span>
      </div>
      <div class="info-row">
        <span class="info-label">API Key</span>
        <span class="info-value">{API_KEY}</span>
      </div>
      <div id="ts-status-box" style="background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.2);border-radius:6px;padding:8px;font-size:9px;color:rgba(0,212,255,.7);margin-top:8px;line-height:1.5">
        ⏳ Checking connection...
      </div>
      <div style="height:8px"></div>
      <button class="btn btn-primary" onclick="testConnection()">
        ⚡ TEST CONNECTION NOW
      </button>
      <div id="conn-result" style="font-size:10px;text-align:center;margin-top:6px;min-height:16px;color:var(--muted)"></div>
    </div>
  </div>

  <!-- Step 2: Install ntfy -->
  <div class="step">
    <div class="step-header">
      <div class="step-num" id="s2-num">2</div>
      <div class="step-info">
        <div class="step-title">INSTALL NTFY (PUSH ALERTS)</div>
        <div class="step-desc">Get JARVIS notifications on your iPhone</div>
      </div>
    </div>
    <div class="step-body">
      <a href="https://apps.apple.com/app/ntfy/id1625396347" class="btn btn-warn">
        📲 INSTALL NTFY FROM APP STORE
      </a>
      <div class="divider"></div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px">After installing, subscribe to this topic:</div>
      <div class="code-box" id="ntfy-topic">{NTFY_TOPIC}<button class="copy-btn" onclick="cp('ntfy-topic',this)">COPY</button></div>
      <a href="ntfy://ntfy.sh/{NTFY_TOPIC}" class="btn btn-green">
        ✅ OPEN NTFY &amp; SUBSCRIBE
      </a>
    </div>
  </div>

  <!-- Step 3 + 4: Install all 6 shortcuts with one tap each -->
  <div class="step">
    <div class="step-header">
      <div class="step-num" id="s3-num">3</div>
      <div class="step-info">
        <div class="step-title">ADD ALL 6 SHORTCUTS — ONE TAP EACH</div>
        <div class="step-desc">Tap each button → Shortcuts app opens → tap "Add Untrusted Shortcut"</div>
      </div>
    </div>
    <div class="step-body">
      <div style="font-size:10px;color:var(--muted);margin-bottom:12px;line-height:1.5;padding:8px;background:rgba(0,212,255,.05);border-radius:6px;border:1px solid rgba(0,212,255,.15)">
        ⚡ Each button below opens the pre-built shortcut in the <strong style="color:var(--glow)">Shortcuts app</strong>.<br>
        Just tap <strong style="color:var(--green)">"Add Untrusted Shortcut"</strong> — that's the only step!
      </div>

      <div style="display:flex;flex-direction:column;gap:10px" id="sc-install-grid">

        <div class="sc-install-card" id="sc-0">
          <div class="sc-install-header">
            <span class="sc-install-emoji">🎙️</span>
            <div class="sc-install-info">
              <div class="sc-install-name">Hey JARVIS</div>
              <div class="sc-install-trigger">Siri voice trigger • Add to Siri after</div>
            </div>
            <span class="sc-install-badge" id="badge-0">READY</span>
          </div>
          <a href="http://{JARVIS_IP}:8000/api/add-shortcut/hey-jarvis"
             class="btn btn-primary sc-install-btn" onclick="markDone(0)">
            📲 ADD TO SHORTCUTS
          </a>
          <div class="sc-siri-hint">After adding → open shortcut → ··· → Add to Siri → say "Hey JARVIS"</div>
        </div>

        <div class="sc-install-card" id="sc-1">
          <div class="sc-install-header">
            <span class="sc-install-emoji">🔋</span>
            <div class="sc-install-info">
              <div class="sc-install-name">JARVIS Battery Alert</div>
              <div class="sc-install-trigger">Automation → Battery Level → below 20%</div>
            </div>
            <span class="sc-install-badge" id="badge-1">READY</span>
          </div>
          <a href="http://{JARVIS_IP}:8000/api/add-shortcut/battery-alert"
             class="btn btn-primary sc-install-btn" onclick="markDone(1)">
            📲 ADD TO SHORTCUTS
          </a>
        </div>

        <div class="sc-install-card" id="sc-2">
          <div class="sc-install-header">
            <span class="sc-install-emoji">🏠</span>
            <div class="sc-install-info">
              <div class="sc-install-name">JARVIS Arrived Home</div>
              <div class="sc-install-trigger">Automation → Location → Arrive at Home</div>
            </div>
            <span class="sc-install-badge" id="badge-2">READY</span>
          </div>
          <a href="http://{JARVIS_IP}:8000/api/add-shortcut/arrived-home"
             class="btn btn-primary sc-install-btn" onclick="markDone(2)">
            📲 ADD TO SHORTCUTS
          </a>
        </div>

        <div class="sc-install-card" id="sc-3">
          <div class="sc-install-header">
            <span class="sc-install-emoji">☀️</span>
            <div class="sc-install-info">
              <div class="sc-install-name">JARVIS Morning Briefing</div>
              <div class="sc-install-trigger">Automation → Time of Day → 9:00 AM</div>
            </div>
            <span class="sc-install-badge" id="badge-3">READY</span>
          </div>
          <a href="http://{JARVIS_IP}:8000/api/add-shortcut/morning-briefing"
             class="btn btn-primary sc-install-btn" onclick="markDone(3)">
            📲 ADD TO SHORTCUTS
          </a>
        </div>

        <div class="sc-install-card" id="sc-4">
          <div class="sc-install-header">
            <span class="sc-install-emoji">🌙</span>
            <div class="sc-install-info">
              <div class="sc-install-name">JARVIS Goodnight</div>
              <div class="sc-install-trigger">Automation → Time of Day → 11:00 PM</div>
            </div>
            <span class="sc-install-badge" id="badge-4">READY</span>
          </div>
          <a href="http://{JARVIS_IP}:8000/api/add-shortcut/goodnight"
             class="btn btn-primary sc-install-btn" onclick="markDone(4)">
            📲 ADD TO SHORTCUTS
          </a>
        </div>

        <div class="sc-install-card" id="sc-5">
          <div class="sc-install-header">
            <span class="sc-install-emoji">🚗</span>
            <div class="sc-install-info">
              <div class="sc-install-name">JARVIS Driving Mode</div>
              <div class="sc-install-trigger">Automation → CarPlay → Connects</div>
            </div>
            <span class="sc-install-badge" id="badge-5">READY</span>
          </div>
          <a href="http://{JARVIS_IP}:8000/api/add-shortcut/driving-mode"
             class="btn btn-primary sc-install-btn" onclick="markDone(5)">
            📲 ADD TO SHORTCUTS
          </a>
        </div>

      </div>

      <div style="margin-top:14px;padding:10px;background:rgba(0,255,136,.05);border:1px solid rgba(0,255,136,.2);border-radius:6px;font-size:9px;color:var(--green);text-align:center;line-height:1.6">
        ✅ After adding all shortcuts, set up automations in Shortcuts app:<br>
        <span style="color:var(--muted)">Automation tab → + → Battery / Location / Time of Day / CarPlay → run shortcut</span>
      </div>
    </div>
  </div>

  <!-- Step 5: Done -->
  <div class="step" style="border-color:rgba(0,255,136,.3)">
    <div class="step-header">
      <div class="step-num done">✓</div>
      <div class="step-info">
        <div class="step-title" style="color:var(--green)">SEND A TEST MESSAGE</div>
        <div class="step-desc">Confirm everything works end-to-end</div>
      </div>
    </div>
    <div class="step-body">
      <input id="test-input" type="text" value="What's the weather right now?"
        style="width:100%;background:rgba(0,0,0,.3);border:1px solid var(--border);
               border-radius:6px;padding:10px;font-size:12px;color:var(--glow);
               font-family:'Courier New',monospace;margin-bottom:8px;outline:none">
      <button class="btn btn-green" onclick="sendTest()">🚀 SEND TO JARVIS</button>
      <div id="test-result" style="font-size:10px;margin-top:8px;padding:8px;
           background:rgba(0,0,0,.3);border-radius:6px;min-height:36px;
           color:var(--text);display:none;border:1px solid var(--border);line-height:1.5"></div>
    </div>
  </div>

</div>

<script>
const TAILSCALE = 'http://{TAILSCALE_IP}:8000';
const LOCAL = 'http://{LOCAL_IP}:8000';
let JARVIS = TAILSCALE;  // active URL, updated by connection test
const API_KEY = '{API_KEY}';
let WEBHOOK = JARVIS + '/api/webhooks/phone';

const SHORTCUTS = [
  {{ emoji:'🎙️', name:'Hey JARVIS', trigger:'Siri voice trigger',
     body:{{"device_name":"iPhone-13","event_type":"voice_command","command":"[Shortcut Input]"}} }},
  {{ emoji:'🔋', name:'Battery Alert', trigger:'Automation: Battery < 20%',
     body:{{"device_name":"iPhone-13","event_type":"battery_low","command":"Battery critical"}} }},
  {{ emoji:'🏠', name:'Arrived Home', trigger:'Automation: Arrive at Home',
     body:{{"device_name":"iPhone-13","event_type":"location","command":"I just arrived home"}} }},
  {{ emoji:'☀️', name:'Morning Briefing', trigger:'Automation: 9:00 AM daily',
     body:{{"device_name":"iPhone-13","event_type":"voice_command","command":"Give me my morning briefing"}} }},
  {{ emoji:'🌙', name:'Goodnight', trigger:'Automation: 11:00 PM',
     body:{{"device_name":"iPhone-13","event_type":"voice_command","command":"Activate bedside mode, set alarm for 7:30 AM"}} }},
  {{ emoji:'🚗', name:'Driving Mode', trigger:'Automation: CarPlay connects',
     body:{{"device_name":"iPhone-13","event_type":"status","command":"Driving mode activated"}} }},
];

// Build shortcut cards
const grid = document.getElementById('sc-grid');
SHORTCUTS.forEach((sc, i) => {{
  const json = JSON.stringify(sc.body, null, 2);
  const id = 'sc-'+i;
  grid.innerHTML += `
    <div class="sc-card">
      <div class="sc-header">
        <div class="sc-left">
          <span class="sc-emoji">${{sc.emoji}}</span>
          <div><div class="sc-name">${{sc.name}}</div><div class="sc-trigger">${{sc.trigger}}</div></div>
        </div>
        <button class="sc-copy" id="btn-${{id}}" onclick="cpText(JSON.stringify(${{JSON.stringify(sc.body)}},null,2),this)">COPY</button>
      </div>
      <div class="sc-body">${{json}}</div>
    </div>`;
}});

// Progress tracking
let steps = [false,false,false,false];
function updateProgress() {{
  const done = steps.filter(Boolean).length;
  document.getElementById('prog').style.width = (done/4*100)+'%';
  document.getElementById('prog-label').textContent = done+' of 4 steps complete';
  steps.forEach((v,i) => {{
    const el = document.getElementById('s'+(i+1)+'-num');
    if(el) {{ el.textContent = v ? '✓' : (i+1); el.className = v ? 'step-num done' : 'step-num'; }}
  }});
}}

// Test connection — tries Tailscale first, then local WiFi
async function testConnection() {{
  const el = document.getElementById('conn-result');
  el.textContent = '⏳ Testing Tailscale...'; el.style.color='var(--warn)';

  // Try Tailscale first
  try {{
    const r = await fetch(TAILSCALE+'/api/health/', {{signal:AbortSignal.timeout(4000)}});
    if(r.ok) {{
      JARVIS = TAILSCALE; WEBHOOK = JARVIS+'/api/webhooks/phone';
      el.textContent = '✅ CONNECTED via Tailscale — works anywhere!';
      el.style.color='var(--green)';
      const box = document.getElementById('ts-status-box');
      if(box) {{ box.textContent='✅ Tailscale connected — JARVIS reachable from anywhere'; box.style.color='var(--green)'; box.style.borderColor='rgba(0,255,136,.3)'; box.style.background='rgba(0,255,136,.05)'; }}
      steps[0] = true; updateProgress(); return;
    }}
  }} catch(e) {{}}

  // Tailscale failed — try local WiFi
  el.textContent = '⏳ Tailscale offline, trying WiFi...'; el.style.color='var(--warn)';
  try {{
    const r = await fetch(LOCAL+'/api/health/', {{signal:AbortSignal.timeout(4000)}});
    if(r.ok) {{
      JARVIS = LOCAL; WEBHOOK = JARVIS+'/api/webhooks/phone';
      el.innerHTML = '⚠️ Connected via WiFi only — open Tailscale for full access';
      el.style.color='var(--warn)';
      const box = document.getElementById('ts-status-box');
      if(box) {{ box.innerHTML='⚠️ WiFi only. Open Tailscale app → tap <strong>Connect</strong> for anywhere access'; box.style.color='var(--warn)'; }}
      steps[0] = true; updateProgress(); return;
    }}
  }} catch(e) {{}}

  const box = document.getElementById('ts-status-box');
  if(box) {{ box.innerHTML='❌ Cannot reach JARVIS. Make sure:<br>1. Tailscale app is OPEN and shows Connected<br>2. Your iPhone is on WiFi'; box.style.color='var(--danger)'; box.style.borderColor='rgba(255,51,51,.3)'; }}
  el.innerHTML = '❌ Not reachable — check Tailscale is ON';
  el.style.color='var(--danger)';
}}

// Send test message
async function sendTest() {{
  const input = document.getElementById('test-input').value;
  const result = document.getElementById('test-result');
  result.style.display='block'; result.textContent='⏳ Sending to JARVIS...';
  try {{
    const r = await fetch(WEBHOOK, {{
      method:'POST',
      headers:{{'Content-Type':'application/json','X-API-Key':API_KEY}},
      body:JSON.stringify({{device_name:'iPhone-Setup',event_type:'voice_command',command:input}}),
      signal:AbortSignal.timeout(20000)
    }});
    const d = await r.json();
    result.textContent = '🤖 JARVIS: '+(d.response || JSON.stringify(d));
    result.style.borderColor='rgba(0,255,136,.3)';
    steps[3] = true; updateProgress();
  }} catch(e) {{
    result.textContent = '❌ '+e.message;
    result.style.borderColor='rgba(255,51,51,.3)';
  }}
}}

// Copy helpers
function cp(id, btn) {{
  const el = document.getElementById(id);
  const text = el.childNodes[0].textContent.trim();
  navigator.clipboard.writeText(text).then(() => {{
    const orig = btn.textContent; btn.textContent='✓ COPIED!'; btn.className='copy-btn copied';
    setTimeout(()=>{{btn.textContent=orig;btn.className='copy-btn';}}, 2000);
  }});
}}
function cpText(text, btn) {{
  navigator.clipboard.writeText(text).then(() => {{
    const orig = btn.textContent; btn.textContent='✓ COPIED!'; btn.className+=' copied';
    setTimeout(()=>{{btn.textContent=orig;}}, 2000);
  }});
}}

// Mark shortcut as added
function markDone(i) {{
  setTimeout(() => {{
    const card = document.getElementById('sc-'+i);
    const badge = document.getElementById('badge-'+i);
    if(card) card.classList.add('done');
    if(badge) {{ badge.textContent='ADDED'; badge.classList.add('done'); }}
    // Count done
    const done = document.querySelectorAll('.sc-install-card.done').length;
    if(done > 0) {{ steps[2] = true; updateProgress(); }}
  }}, 500);
}}

// Auto-test on load
setTimeout(testConnection, 1000);
</script>
</body>
</html>"""
