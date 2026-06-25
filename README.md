<div align="center">

# 🤖 J.A.R.V.I.S.

### *Just A Rather Very Intelligent System*

**A full-stack, Iron-Man-style personal AI assistant that lives on your machine — talks, listens, monitors your system, controls your phone, and gets real work done through a Claude-powered agent with a security-first permission model.**

<p>
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Electron-2B2E3A?style=for-the-badge&logo=electron&logoColor=9FEAF9" alt="Electron">
  <img src="https://img.shields.io/badge/Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude">
</p>

<p>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows" alt="Platform">
  <img src="https://img.shields.io/badge/status-active-success?style=flat-square" alt="Status">
  <img src="https://img.shields.io/badge/tools-60%2B-orange?style=flat-square" alt="Tools">
</p>

</div>

---

## ⚡ What is JARVIS?

JARVIS is a personal AI assistant inspired by the one in Iron Man — but real, running locally on your own PC. At its core is a **Claude-powered agent** that can understand natural language and act on your machine through **60+ purpose-built tools**, all gated behind a **four-level permission system** so it can never do something destructive without your say-so.

It ships with a slick **Iron-Man-HUD dashboard**, **voice control** ("Hey Jarvis"), **system monitoring with smart alerts**, **phone mirroring & control**, and integrations for **Telegram, GitLab, calendar, weather, news and more** — wrapped in a native **Electron desktop app** that lives in your system tray.

> 🧠 **Brain:** Anthropic Claude (streaming tool use) · 🖥️ **Body:** FastAPI + React · 🛡️ **Conscience:** a permission engine that asks before it acts.

---

## ✨ Features

### 🗣️ Conversational AI Agent
- Natural-language chat with **streaming responses** and live tool execution
- **60+ built-in tools** spanning files, system, code, network, phone, and productivity
- Remembers context across a conversation and explains what it's doing

### 🛡️ Security-First Permission System
Every tool is classified into one of four levels — JARVIS **cannot** cross a line without you:

| Level | Name | Examples | Behavior |
|:---:|---|---|---|
| **1** | 🟢 Read Only | `read_file`, `get_system_status`, `git_diff` | Auto-executes |
| **2** | 🔵 Safe Action | `run_npm_build`, `write_file`, `django_check` | Auto-executes |
| **3** | 🟡 Needs Approval | `git_commit`, `delete_file`, `run_command` | Shows an approval card |
| **4** | 🔴 Blocked | `drop_database`, `delete_directory` | Always refused |

Every action is written to a full **audit log**.

### 📊 System Monitoring & Alerts
- Live **CPU / RAM / disk / network** metrics with charts on the HUD dashboard
- Background health check every **5 minutes**, alert-rule evaluation every **1 minute**
- Create rules in plain English: *"Alert me if disk C: exceeds 85%"*

### 🎙️ Voice Control
- **"Hey Jarvis"** wake word → speak → it transcribes, thinks, and **speaks back**
- **faster-whisper** for speech-to-text, **Windows TTS / ElevenLabs** for voice

### 📱 Phone Integration & Control
- **Mirror & control your Android** screen from the dashboard (ADB + scrcpy)
- Read notifications, launch apps, press hardware keys — or just ask: *"Open WhatsApp on my phone"*
- **iPhone & Android webhooks** via Shortcuts / Tasker for voice commands on the go

### 🔔 Multi-Channel Notifications
- Fan-out alerts to **WebSocket (dashboard) + Telegram + ntfy** simultaneously

### 🖥️ Native Desktop Experience
- **Electron** app with system-tray presence and global hotkeys (`Win+J` to summon)
- Auto-starts with Windows; backend boots inside the app — no terminal needed

### 🌐 Productivity Integrations
GitLab, Google Calendar, Gmail, Weather, News feeds, Music control, and more — surfaced through dedicated HUD panels.

---

## 🧰 Tech Stack

| Layer | Technologies |
|---|---|
| **AI Brain** | Anthropic **Claude** API (streaming tool use) via the official `anthropic` SDK |
| **Backend** | **Python** · **FastAPI** · **SQLAlchemy** (async) · SQLite · Redis/Celery · APScheduler |
| **Frontend** | **React 18** · **TypeScript** · **Vite** · **Tailwind CSS** · Framer Motion · Recharts · Zustand |
| **Desktop** | **Electron** (system tray, global hotkeys, native notifications) |
| **Voice** | faster-whisper (STT) · openWakeWord · Windows TTS / ElevenLabs (TTS) |
| **Phone** | ADB · scrcpy · webhook bridge (iPhone Shortcuts / Android Tasker) |
| **Messaging** | Telegram Bot API · ntfy · WhatsApp (via `whatsapp-web.js` service) |

---

## 🚀 Quick Start

> **Prerequisites:** Python 3.11+ · Node.js 20+ · Redis (local) · an [Anthropic API key](https://console.anthropic.com)

```powershell
# 1. Clone
git clone https://github.com/Alan7149/JARVIS.git
cd JARVIS

# 2. First-time setup (creates venvs, installs deps)
.\setup.ps1

# 3. Configure your secrets — create backend\.env
#    ANTHROPIC_API_KEY=sk-ant-your-key-here
#    API_KEY=choose-a-secure-key-for-phone-webhooks

# 4. Launch everything
.\start.ps1
```

Then open:

| Surface | URL |
|---|---|
| 🖥️ Dashboard (HUD) | http://localhost:5173 |
| ⚙️ API | http://localhost:8000 |
| 📚 API Docs (Swagger) | http://localhost:8000/docs |

**Prefer the desktop app?**
```powershell
cd electron
npm install
npm start        # tray app — backend auto-starts inside it
```

📖 **Full setup, phone pairing, voice, and notifications guide → [SETUP.md](SETUP.md)**

---

## 🗂️ Project Structure

```
JARVIS/
├── backend/                 # FastAPI app (the "body" + nervous system)
│   ├── main.py              # Application entry point
│   ├── core/                # config, async DB, permissions, audit, scheduler, websockets
│   ├── agent/               # jarvis_agent.py (Claude brain) + tool_registry.py
│   ├── tools/               # file / system / code / desktop / alert tool implementations
│   ├── monitoring/          # system_monitor (5min) + alert_checker (1min)
│   ├── notifications/       # WebSocket + Telegram + ntfy fan-out
│   ├── api/routes/          # 30+ route modules (chat, alerts, phone, gitlab, voice…)
│   ├── voice/               # wake word + Whisper transcription
│   └── models/              # SQLAlchemy models
├── frontend/                # React + Vite + Tailwind HUD dashboard
│   └── src/pages/           # Dashboard, Chat, Alerts, Devices, Tools, Logs…
├── electron/                # Desktop wrapper (tray, hotkeys, auto-start)
├── whatsapp-service/        # Node WhatsApp bridge
└── scripts/                 # Helper PowerShell scripts
```

---

## 💬 Talk to JARVIS

Open the **chat** and type (or speak) naturally:

```
"Check the system status"
"Why is port 8000 not responding?"
"Search my projects for handleFind"
"Run the tests in D:\Projects\myapp"
"Create an alert if disk C: exceeds 85%"
"Open VS Code in D:\Projects\myapp"
"What changed in my git repo?"
"Open WhatsApp on my phone"
```

---

## 🔒 Security & Privacy Notes

- JARVIS is designed to **run locally on your own machine** — your files, metrics, and conversations stay on your hardware.
- It can read files, run commands, and control your PC/phone. **Read the permission model** and keep Level 3/4 protections in place.
- **Never expose the backend to the public internet** without putting it behind authentication and HTTPS, and **always override the default `API_KEY`** used for phone webhooks.
- Your `ANTHROPIC_API_KEY` and all secrets live in `backend\.env`, which is git-ignored and never committed.

---

## 🗺️ Roadmap Ideas

- [ ] Cross-platform support (macOS / Linux)
- [ ] Pluggable LLM providers
- [ ] Richer document indexing & retrieval
- [ ] Mobile companion app
- [ ] One-command Docker deployment

---

## 🤝 Contributing

This started as a personal project, but ideas, issues, and PRs are welcome. Fork it, branch it, and open a pull request — or just open an issue with a suggestion.

---

## 📄 License

Released under the **MIT License** — see [LICENSE](LICENSE). You're free to use, modify, and build on it; it's provided **as-is, without warranty**.

---

## 🙏 Acknowledgements

- **[Anthropic Claude](https://www.anthropic.com/claude)** — the reasoning engine behind the agent
- **[scrcpy](https://github.com/Genymobile/scrcpy)** — Android mirroring & control
- **[faster-whisper](https://github.com/SYSTRAN/faster-whisper)** — speech-to-text
- Inspired by **JARVIS** from Marvel's Iron Man 🦾

<div align="center">

---

**Built with ⚡ by [Alan Babu](https://github.com/Alan7149)**

*"Sometimes you gotta run before you can walk."*

</div>
