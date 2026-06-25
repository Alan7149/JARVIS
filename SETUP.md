# JARVIS — Setup & Operations Guide

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | `python --version` |
| Node.js 20+ | `node --version` |
| PostgreSQL 15+ | Running on localhost:5432 |
| Redis | Running on localhost:6379 |
| Anthropic API key | Get from console.anthropic.com |

---

## Quick Start

### 1. First-time setup

```powershell
# From the JARVIS project root (where you cloned it)
.\setup.ps1
```

### 2. Configure your environment

Edit `backend\.env`:

```env
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
API_KEY=choose-a-secure-key-for-phone-webhooks
INDEX_PATHS=["C:\\path\\to\\your\\projects"]
```

### 3. Create the database

```sql
-- Run in psql
CREATE USER jarvis WITH PASSWORD 'jarvis';
CREATE DATABASE jarvis OWNER jarvis;
```

### 4. Start JARVIS

```powershell
.\start.ps1
```

JARVIS will be available at:
- **Dashboard**: http://localhost:5173
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

---

## Architecture

```
JARVIS/
├── backend/
│   ├── main.py                  # FastAPI application entry point
│   ├── core/
│   │   ├── config.py            # All settings (reads from .env)
│   │   ├── database.py          # SQLAlchemy async setup
│   │   ├── permissions.py       # 4-level permission system
│   │   ├── audit.py             # Action logging
│   │   ├── scheduler.py         # APScheduler for recurring checks
│   │   └── websocket_manager.py # Live dashboard updates
│   ├── agent/
│   │   ├── jarvis_agent.py      # Claude-powered brain (streaming)
│   │   └── tool_registry.py     # All tool definitions + dispatcher
│   ├── tools/
│   │   ├── file_tools.py        # Read, search, write files
│   │   ├── system_tools.py      # CPU, RAM, disk, ports, URLs
│   │   ├── code_tools.py        # Git, npm, Django, pytest
│   │   ├── desktop_tools.py     # Open VS Code, apps
│   │   └── alert_tools.py       # Create monitoring rules
│   ├── monitoring/
│   │   ├── system_monitor.py    # Every 5min system health check
│   │   └── alert_checker.py     # Every 1min alert rule evaluation
│   ├── notifications/
│   │   └── notifier.py          # WebSocket + Telegram + ntfy
│   ├── api/routes/              # FastAPI route handlers
│   └── models/                  # SQLAlchemy database models
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.tsx    # Live system metrics + charts
        │   ├── Chat.tsx         # JARVIS conversation interface
        │   ├── Alerts.tsx       # Alert rule management
        │   ├── Devices.tsx      # Phone/device connections
        │   ├── Tools.tsx        # Tool registry + permissions
        │   └── Logs.tsx         # Full audit log
        └── contexts/
            └── WebSocketContext.tsx  # Live updates
```

---

## Permission Levels

| Level | Name | Examples | Behavior |
|---|---|---|---|
| 1 | READ ONLY | read_file, get_system_status, git_diff | Auto-execute |
| 2 | SAFE ACTION | run_npm_build, run_django_check, write_file | Auto-execute |
| 3 | NEEDS APPROVAL | git_commit, delete_file, run_command | Shows approval card in dashboard |
| 4 | BLOCKED | drop_database, delete_directory | Always refused |

---

## Talking to JARVIS

Open the **INTERFACE** tab and type naturally:

```
"Check the system status"
"Why is port 8000 not responding?"
"Search my projects for handleFind"
"Run tests in D:\Projects\myapp"
"Create an alert if disk C: exceeds 85%"
"Open VS Code in D:\Projects\myapp"
"Summarize the last 50 lines of app.log"
"What changed in my git repo?"
```

---

## Phone Integration

### Android (Tasker + AutoVoice)

1. Install Tasker and AutoVoice
2. Create a profile with an AutoVoice trigger
3. Add HTTP POST action:
   - URL: `http://YOUR_PC_IP:8000/api/webhooks/phone`
   - Header: `X-API-Key: your-api-key`
   - Body:
     ```json
     {
       "device_name": "My Android",
       "event_type": "voice_command",
       "data": {"command": "%avcomm"}
     }
     ```

### iPhone (Shortcuts)

1. Create a shortcut with "Get contents of URL"
2. URL: `http://YOUR_PC_IP:8000/api/webhooks/phone`
3. Method: POST
4. Headers: `X-API-Key`, `Content-Type: application/json`
5. Body: `{"device_name":"My iPhone","event_type":"voice_command","data":{"command":"[your input]"}}`

---

## Notifications Setup

### Telegram (recommended)

1. Message @BotFather on Telegram → `/newbot`
2. Copy the bot token → set `TELEGRAM_BOT_TOKEN` in `.env`
3. Start a chat with your bot, get your chat ID from `https://api.telegram.org/bot{TOKEN}/getUpdates`
4. Set `TELEGRAM_CHAT_ID` in `.env`

### ntfy.sh (simple, works on any device)

1. Install ntfy app on your phone
2. Subscribe to a unique topic
3. Set `NTFY_URL=https://ntfy.sh` and `NTFY_TOPIC=jarvis-yourname` in `.env`

---

## Adding Whisper Voice Input

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install faster-whisper
```

Then POST audio files to `/api/voice/transcribe`.

---

## Indexing Your Projects

Set `INDEX_PATHS` in `.env`, then trigger indexing via the API or ask JARVIS:

```
"Index my projects folder"
```

Or call the API:
```
POST /api/files/index?path=D:\Projects\myapp
```

---

## Desktop App (Electron)

The Electron wrapper gives JARVIS a real desktop presence:
- **System tray** — JARVIS runs silently in the background
- **Win+J** — Show/hide dashboard from anywhere
- **Win+Shift+J** — Jump directly to chat
- **Alt+J** — Quick chat popup
- **Auto-start with Windows**
- **Native notifications**

```powershell
cd electron
npm install
npm start        # Launch desktop app
npm run build    # Build installer (.exe)
```

**Note:** In Electron mode, the backend auto-starts inside the app. No need to run `start.ps1` separately.

---

## Phone Control (Android via ADB)

### Quick Setup

```powershell
# Install Android Platform Tools
winget install Google.PlatformTools

# Install scrcpy (full screen mirror + control)
winget install Genymobile.scrcpy

# Restart terminal, connect phone via USB
adb devices   # Should show your device
```

### Wireless Connection (no USB needed after first time)

1. Connect phone via USB once
2. Open JARVIS → PHONE tab
3. Find your phone's IP in Settings → WiFi → Advanced
4. Enter IP in "Connect via WiFi" field
5. Unplug USB — stays connected over WiFi

### What You Can Do

| Action | How |
|---|---|
| See phone screen | PHONE tab → LIVE MIRROR |
| Click on screen | Click directly on the mirror image |
| Full native control | PHONE tab → SCRCPY button |
| Press Home/Back/Power | Hardware Controls buttons |
| Type text | Type on Phone field |
| Launch apps | Quick Launch buttons |
| Read notifications | PHONE tab → REFRESH notifications |
| Ask JARVIS to control phone | "Jarvis, open WhatsApp on my phone" |

---

## Wake Word Voice Control

```powershell
# Install voice dependencies
cd backend
.\.venv\Scripts\Activate.ps1
pip install faster-whisper pyaudio sounddevice soundfile openwakeword numpy

# Start the wake word listener (run alongside the main server)
python -m voice.wake_word_listener
```

Say **"Hey Jarvis"** — you'll hear a tone — then speak your command.

JARVIS will:
1. Detect the wake word
2. Record your voice until you stop speaking
3. Transcribe with Whisper
4. Send to Claude
5. Speak the response back (Windows TTS built-in, or ElevenLabs if configured)

---

## Common Commands

```powershell
# Start everything
.\start.ps1

# Backend only
cd backend; .\.venv\Scripts\Activate.ps1; python -m uvicorn main:app --reload

# Frontend only
cd frontend; npm run dev

# Build frontend for production
cd frontend; npm run build
```
