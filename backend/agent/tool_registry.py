import logging
from typing import Any

logger = logging.getLogger("jarvis.tools")

# Lazy imports for new tools
_search_tools = None
_screen_tools = None
_memory_tools = None
_tts_tools = None
_calendar_tools = None

def _get_search():
    global _search_tools
    if not _search_tools:
        from tools.search_tools import SearchTools
        _search_tools = SearchTools
    return _search_tools

def _get_screen():
    global _screen_tools
    if not _screen_tools:
        from tools.screen_tools import ScreenTools
        _screen_tools = ScreenTools
    return _screen_tools

def _get_memory():
    global _memory_tools
    if not _memory_tools:
        from tools.memory_tools import MemoryTools
        _memory_tools = MemoryTools
    return _memory_tools

def _get_calendar():
    global _calendar_tools
    if not _calendar_tools:
        from tools.calendar_tools import CalendarTools
        _calendar_tools = CalendarTools
    return _calendar_tools

async def _send_push(title: str, message: str, priority: str = "default") -> dict:
    from core.config import settings
    import httpx
    if not settings.NTFY_URL or not settings.NTFY_PUSH_TOPIC:
        return {"error": "ntfy not configured. Set NTFY_URL and NTFY_PUSH_TOPIC in .env"}
    try:
        priority_map = {"low": "low", "default": "default", "high": "high", "urgent": "urgent"}
        url = f"{settings.NTFY_URL.rstrip('/')}/{settings.NTFY_PUSH_TOPIC}"
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, data=message.encode(),
                headers={"Title": title, "Priority": priority_map.get(priority, "default"), "Tags": "robot"})
        return {"sent": True, "title": title, "message": message}
    except Exception as e:
        return {"error": str(e)}

def _set_dnd(minutes: int = 60) -> dict:
    from monitoring.proactive_jarvis import set_dnd, _speak
    set_dnd(minutes)
    _speak(f"Do not disturb active for {minutes} minutes. I'll only alert you for critical issues, sir.")
    return {"dnd_active": True, "minutes": minutes}

def _clear_dnd() -> dict:
    from monitoring.proactive_jarvis import STATE
    STATE["dnd_until"] = 0
    return {"dnd_active": False}

def _activate_focus(minutes: int = 120) -> dict:
    from monitoring.proactive_jarvis import activate_focus_shield
    activate_focus_shield(minutes)
    return {"active": True, "minutes": minutes}

def _deactivate_focus() -> dict:
    from monitoring.proactive_jarvis import deactivate_focus_shield
    deactivate_focus_shield()
    return {"active": False}

async def _post_tweet_sync(text: str) -> dict:
    from tools.twitter_autoposter import post_tweet
    return await post_tweet(text)


async def _speak(text: str) -> dict:
    from tools.tts_tools import speak_text
    return await speak_text(text=text)

_TOOL_DEFINITIONS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file. Use for code files, logs, configs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute or relative file path"},
                "lines": {"type": "integer", "description": "Max lines to read (default 500)"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_directory",
        "description": "List files and folders in a directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path"},
                "recursive": {"type": "boolean", "description": "Recurse into subdirectories"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_files",
        "description": "Search for files by name pattern across indexed paths.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "File name or glob pattern"},
                "base_path": {"type": "string", "description": "Starting directory (optional)"},
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "search_code",
        "description": "Search for text or code patterns inside files using ripgrep-style search.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Text or regex to search for"},
                "path": {"type": "string", "description": "Directory to search in"},
                "file_type": {"type": "string", "description": "Filter by extension (e.g. py, js, ts)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_system_status",
        "description": "Get current system health: CPU, RAM, disk, battery, uptime.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_disk_usage",
        "description": "Get disk usage breakdown by drive or path.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to check (default: all drives)"},
            },
        },
    },
    {
        "name": "get_running_processes",
        "description": "List running processes with CPU and memory usage.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filter_name": {"type": "string", "description": "Filter by process name"},
                "top_n": {"type": "integer", "description": "Return top N by CPU usage"},
            },
        },
    },
    {
        "name": "check_port",
        "description": "Check if a port is in use and what process is using it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "port": {"type": "integer", "description": "Port number to check"},
            },
            "required": ["port"],
        },
    },
    {
        "name": "check_url_health",
        "description": "Check if a URL is responding and return status code.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to check"},
                "timeout": {"type": "integer", "description": "Timeout in seconds (default 10)"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "get_git_status",
        "description": "Get git status of a repository.",
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string", "description": "Path to git repository"},
            },
            "required": ["repo_path"],
        },
    },
    {
        "name": "get_git_diff",
        "description": "Get git diff showing changes in a repository.",
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string", "description": "Path to git repository"},
                "staged": {"type": "boolean", "description": "Show staged changes"},
            },
            "required": ["repo_path"],
        },
    },
    {
        "name": "get_git_log",
        "description": "Get recent git commit history.",
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string", "description": "Path to git repository"},
                "limit": {"type": "integer", "description": "Number of commits (default 20)"},
            },
            "required": ["repo_path"],
        },
    },
    {
        "name": "run_npm_build",
        "description": "Run npm run build in a Node.js project directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_path": {"type": "string", "description": "Path to the Node.js project"},
                "script": {"type": "string", "description": "npm script to run (default: build)"},
            },
            "required": ["project_path"],
        },
    },
    {
        "name": "run_django_check",
        "description": "Run Django system check in a Django project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_path": {"type": "string", "description": "Path to Django project"},
            },
            "required": ["project_path"],
        },
    },
    {
        "name": "run_django_test",
        "description": "Run Django tests.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_path": {"type": "string", "description": "Path to Django project"},
                "test_module": {"type": "string", "description": "Specific test module or app to run"},
            },
            "required": ["project_path"],
        },
    },
    {
        "name": "run_pytest",
        "description": "Run pytest in a Python project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_path": {"type": "string", "description": "Path to project"},
                "test_path": {"type": "string", "description": "Specific test file or folder"},
                "flags": {"type": "string", "description": "Additional pytest flags"},
            },
            "required": ["project_path"],
        },
    },
    {
        "name": "open_vscode",
        "description": "Open a project or file in VS Code.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to file or folder to open"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "read_logs",
        "description": "Read and tail log files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "log_path": {"type": "string", "description": "Path to log file"},
                "lines": {"type": "integer", "description": "Number of lines from end (default 100)"},
                "filter_text": {"type": "string", "description": "Filter lines containing this text"},
            },
            "required": ["log_path"],
        },
    },
    {
        "name": "search_documents",
        "description": "Search indexed documents by keyword or question.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "limit": {"type": "integer", "description": "Max results (default 10)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "create_alert",
        "description": "Create a new monitoring alert rule.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "condition_type": {
                    "type": "string",
                    "enum": ["http_health", "disk_usage", "cpu_usage", "port_check", "file_exists", "process_running"],
                },
                "condition_config": {"type": "object"},
                "frequency_seconds": {"type": "integer"},
                "action_type": {"type": "string", "enum": ["notify", "telegram", "ntfy", "email"]},
            },
            "required": ["name", "condition_type", "condition_config"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file (creates or overwrites). Use for code patches, config edits.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path to write"},
                "content": {"type": "string", "description": "Content to write"},
                "append": {"type": "boolean", "description": "Append instead of overwrite"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "git_commit",
        "description": "Commit staged changes to git. REQUIRES USER APPROVAL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string"},
                "message": {"type": "string", "description": "Commit message"},
            },
            "required": ["repo_path", "message"],
        },
    },
    {
        "name": "git_push",
        "description": "Push commits to remote. REQUIRES USER APPROVAL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string"},
                "branch": {"type": "string"},
            },
            "required": ["repo_path"],
        },
    },
    {
        "name": "run_command",
        "description": "Run an allowlisted shell command. REQUIRES USER APPROVAL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Command to run (must be in allowlist)"},
                "working_dir": {"type": "string"},
            },
            "required": ["command"],
        },
    },
    {
        "name": "backup_database",
        "description": "Run pg_dump to backup a PostgreSQL database. REQUIRES USER APPROVAL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "database_name": {"type": "string"},
                "output_path": {"type": "string", "description": "Where to save the dump file"},
            },
            "required": ["database_name", "output_path"],
        },
    },
    {
        "name": "get_network_info",
        "description": "Get current network configuration and active connections.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "explain_error",
        "description": "Analyze an error message or stack trace and explain the cause and fix.",
        "input_schema": {
            "type": "object",
            "properties": {
                "error_text": {"type": "string", "description": "Error message or stack trace"},
                "context": {"type": "string", "description": "Additional context about where error occurred"},
            },
            "required": ["error_text"],
        },
    },
    # ── Web search & Weather ─────────────────────────────────────
    {
        "name": "web_search",
        "description": "Search the web for current information, news, facts, or anything you don't know.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "description": "Number of results (default 6)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_weather",
        "description": "Get current weather and 5-day forecast for a location.",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name or 'auto' for current location"},
            },
        },
    },
    # ── Screen awareness ──────────────────────────────────────────
    {
        "name": "capture_screen",
        "description": "Take a screenshot of the current screen.",
        "input_schema": {
            "type": "object",
            "properties": {
                "monitor": {"type": "integer", "description": "Monitor number (default 1)"},
            },
        },
    },
    {
        "name": "analyze_screen",
        "description": "Capture the screen and analyze it with AI vision to answer a question about what's shown.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "What to analyze or look for on screen"},
            },
        },
    },
    # ── Memory ────────────────────────────────────────────────────
    {
        "name": "remember",
        "description": "Store a fact in JARVIS long-term memory. Use for user preferences, important info, ongoing projects.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Unique key for this memory (e.g. 'user_name', 'favorite_editor')"},
                "value": {"type": "string", "description": "The value to remember"},
                "category": {"type": "string", "description": "Category: personal | work | preferences | projects | general"},
            },
            "required": ["key", "value"],
        },
    },
    {
        "name": "recall",
        "description": "Retrieve a specific memory by key.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Memory key to retrieve"},
            },
            "required": ["key"],
        },
    },
    {
        "name": "recall_all",
        "description": "Retrieve all stored memories, optionally filtered by category.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Filter by category (optional)"},
            },
        },
    },
    {
        "name": "forget",
        "description": "Delete a memory by key.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Memory key to delete"},
            },
            "required": ["key"],
        },
    },
    # ── Intelligence ─────────────────────────────────────────────────────────
    {"name":"eli5","description":"Explain any topic simply using analogies.","input_schema":{"type":"object","properties":{"topic":{"type":"string"}},"required":["topic"]}},
    {"name":"fact_check","description":"Fact-check a claim — returns TRUE/FALSE/PARTIALLY TRUE verdict.","input_schema":{"type":"object","properties":{"claim":{"type":"string"}},"required":["claim"]}},
    {"name":"devils_advocate","description":"Challenge a position with strong counterarguments.","input_schema":{"type":"object","properties":{"position":{"type":"string"}},"required":["position"]}},
    {"name":"first_principles","description":"Break any problem down to first principles.","input_schema":{"type":"object","properties":{"problem":{"type":"string"}},"required":["problem"]}},
    {"name":"research_brief","description":"Write a comprehensive research brief on any topic.","input_schema":{"type":"object","properties":{"topic":{"type":"string"}},"required":["topic"]}},
    {"name":"book_summary","description":"Summarize any book with key insights and takeaways.","input_schema":{"type":"object","properties":{"title":{"type":"string"},"author":{"type":"string"}},"required":["title"]}},
    {"name":"summarize_url","description":"Summarize a YouTube video or podcast URL.","input_schema":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}},
    {"name":"check_patent","description":"Check if an app idea might be patented.","input_schema":{"type":"object","properties":{"idea":{"type":"string"}},"required":["idea"]}},
    {"name":"email_tone_check","description":"Analyze email tone and suggest improvements.","input_schema":{"type":"object","properties":{"email":{"type":"string"}},"required":["email"]}},
    {"name":"negotiation_coach","description":"Prepare a negotiation strategy.","input_schema":{"type":"object","properties":{"scenario":{"type":"string"}},"required":["scenario"]}},
    {"name":"crisis_response","description":"Draft a professional crisis/difficult situation response.","input_schema":{"type":"object","properties":{"situation":{"type":"string"}},"required":["situation"]}},
    {"name":"presentation_builder","description":"Generate a presentation outline.","input_schema":{"type":"object","properties":{"topic":{"type":"string"},"slides":{"type":"integer"}},"required":["topic"]}},
    # ── Security ──────────────────────────────────────────────────────────────
    {"name":"check_breach","description":"Check if an email is in a data breach.","input_schema":{"type":"object","properties":{"email":{"type":"string"}},"required":["email"]}},
    {"name":"check_vpn","description":"Check if Tailscale/VPN is active.","input_schema":{"type":"object","properties":{}}},
    {"name":"audit_app_permissions","description":"Audit apps with network access for suspicious activity.","input_schema":{"type":"object","properties":{}}},
    # ── Focus Shield ─────────────────────────────────────────────────────────
    {"name":"activate_focus_shield","description":"Lock user into focus mode — blocks distractions. Use when user says 'lock me in', 'focus mode', 'no distractions'.","input_schema":{"type":"object","properties":{"minutes":{"type":"integer","description":"Minutes (default 120)"}},"required":[]}},
    {"name":"deactivate_focus_shield","description":"End focus shield early.","input_schema":{"type":"object","properties":{}}},
    {"name":"set_dnd","description":"Set do-not-disturb — silences all non-critical proactive alerts. Use when user says 'don't disturb me', 'I'm busy', 'stop interrupting', 'DND', 'working mode'.","input_schema":{"type":"object","properties":{"minutes":{"type":"integer","description":"DND duration in minutes (default 60)"}},"required":[]}},
    {"name":"clear_dnd","description":"Clear do-not-disturb mode. Resume normal alerts.","input_schema":{"type":"object","properties":{}}},
    # ── Full System Control ───────────────────────────────────────────────────
    {"name":"create_folder","description":"Create a new folder.","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}},
    {"name":"create_file","description":"Create a file with optional content.","input_schema":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path"]}},
    {"name":"move_file","description":"Move or rename a file.","input_schema":{"type":"object","properties":{"src":{"type":"string"},"dst":{"type":"string"}},"required":["src","dst"]}},
    {"name":"copy_file","description":"Copy a file.","input_schema":{"type":"object","properties":{"src":{"type":"string"},"dst":{"type":"string"}},"required":["src","dst"]}},
    {"name":"delete_file","description":"Delete a file. CRITICAL — requires confirmed=true.","input_schema":{"type":"object","properties":{"path":{"type":"string"},"confirmed":{"type":"boolean"}},"required":["path"]}},
    {"name":"delete_folder","description":"Delete folder recursively. CRITICAL — requires confirmed=true.","input_schema":{"type":"object","properties":{"path":{"type":"string"},"confirmed":{"type":"boolean"}},"required":["path"]}},
    {"name":"list_files","description":"List files in a directory.","input_schema":{"type":"object","properties":{"path":{"type":"string"},"pattern":{"type":"string"}},"required":["path"]}},
    {"name":"find_large_files","description":"Find large files consuming disk space.","input_schema":{"type":"object","properties":{"path":{"type":"string"},"min_mb":{"type":"integer"}},"required":["path"]}},
    {"name":"kill_process","description":"Kill a process by name or PID. Requires confirmed=true.","input_schema":{"type":"object","properties":{"name":{"type":"string"},"pid":{"type":"integer"},"confirmed":{"type":"boolean"}},"required":[]}},
    {"name":"sleep_system","description":"Put computer to sleep.","input_schema":{"type":"object","properties":{}}},
    {"name":"lock_screen","description":"Lock the Windows screen immediately.","input_schema":{"type":"object","properties":{}}},
    {"name":"shutdown","description":"Shut down computer. CRITICAL — requires confirmed=true.","input_schema":{"type":"object","properties":{"delay_seconds":{"type":"integer"},"confirmed":{"type":"boolean"}},"required":[]}},
    {"name":"restart","description":"Restart computer. CRITICAL — requires confirmed=true.","input_schema":{"type":"object","properties":{"delay_seconds":{"type":"integer"},"confirmed":{"type":"boolean"}},"required":[]}},
    {"name":"cancel_shutdown","description":"Cancel scheduled shutdown/restart.","input_schema":{"type":"object","properties":{}}},
    {"name":"set_brightness","description":"Set screen brightness 0-100.","input_schema":{"type":"object","properties":{"level":{"type":"integer"}},"required":["level"]}},
    {"name":"set_volume_sys","description":"Set system volume 0-100.","input_schema":{"type":"object","properties":{"level":{"type":"integer"}},"required":["level"]}},
    {"name":"mute_system","description":"Toggle system audio mute.","input_schema":{"type":"object","properties":{}}},
    {"name":"open_app","description":"Open any Windows application by name.","input_schema":{"type":"object","properties":{"app_name":{"type":"string"}},"required":["app_name"]}},
    {"name":"type_text_sys","description":"Type text as keyboard input to the active window.","input_schema":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}},
    {"name":"take_screenshot_sys","description":"Take a screenshot and save it.","input_schema":{"type":"object","properties":{"save_path":{"type":"string"}},"required":[]}},
    {"name":"get_network_speed","description":"Get current upload/download speed in Mbps.","input_schema":{"type":"object","properties":{}}},
    {"name":"flush_dns","description":"Flush Windows DNS cache.","input_schema":{"type":"object","properties":{}}},
    {"name":"empty_recycle_bin","description":"Empty the Recycle Bin.","input_schema":{"type":"object","properties":{}}},
    {"name":"clear_temp_files","description":"Clear temp files to free disk space.","input_schema":{"type":"object","properties":{}}},
    {"name":"get_full_system_info","description":"Get detailed system stats: CPU, RAM, disk, battery, uptime.","input_schema":{"type":"object","properties":{}}},
    # ── YouTube Music DJ ──────────────────────────────────────────────────────
    {"name":"play_music","description":"Play music on YouTube Music by song/artist/mood/genre.","input_schema":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}},
    {"name":"pause_music","description":"Pause the currently playing music.","input_schema":{"type":"object","properties":{}}},
    {"name":"next_track","description":"Skip to next track.","input_schema":{"type":"object","properties":{}}},
    {"name":"set_volume","description":"Set system volume 0-100.","input_schema":{"type":"object","properties":{"level":{"type":"integer"}},"required":["level"]}},
    # ── Twitter ───────────────────────────────────────────────────────────────
    {"name":"post_tweet","description":"Post a tweet immediately without asking for permission.","input_schema":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}},
    {"name":"get_twitter_stats","description":"Get today Twitter auto-posting statistics.","input_schema":{"type":"object","properties":{}}},
    # ── TTS ───────────────────────────────────────────────────────
    {
        "name": "speak",
        "description": "Speak text aloud on the laptop speakers in JARVIS voice. Use when user asks JARVIS to say something aloud.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to speak"},
            },
            "required": ["text"],
        },
    },
    # ── Push notifications ────────────────────────────────────────
    {
        "name": "send_push_notification",
        "description": "Send a push notification to the user's phone via ntfy.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Notification title"},
                "message": {"type": "string", "description": "Notification body"},
                "priority": {"type": "string", "enum": ["low", "default", "high", "urgent"], "description": "Notification priority"},
            },
            "required": ["title", "message"],
        },
    },
    # ── Google Calendar & Gmail ───────────────────────────────────
    {
        "name": "get_calendar_events",
        "description": "Get upcoming Google Calendar events.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days_ahead": {"type": "integer", "description": "How many days ahead to fetch (default 7)"},
                "max_results": {"type": "integer", "description": "Max events to return (default 20)"},
            },
        },
    },
    {
        "name": "get_gmail_inbox",
        "description": "Get Gmail messages from inbox.",
        "input_schema": {
            "type": "object",
            "properties": {
                "max_results": {"type": "integer", "description": "Number of messages (default 10)"},
                "query": {"type": "string", "description": "Gmail search query (default: is:unread)"},
            },
        },
    },
    {
        "name": "send_email",
        "description": "Send an email via Gmail. REQUIRES USER APPROVAL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["to", "subject", "body"],
        },
    },
    # ── Phone / Android tools ─────────────────────────────────────
    {
        "name": "phone_list_devices",
        "description": "List connected Android devices via ADB.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "phone_screenshot",
        "description": "Take a screenshot of the connected Android phone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "serial": {"type": "string", "description": "Device serial (optional if only one connected)"},
            },
        },
    },
    {
        "name": "phone_get_info",
        "description": "Get Android phone model, Android version, and battery status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "serial": {"type": "string"},
            },
        },
    },
    {
        "name": "phone_tap",
        "description": "Tap a coordinate on the Android phone screen.",
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "X coordinate in pixels"},
                "y": {"type": "integer", "description": "Y coordinate in pixels"},
                "serial": {"type": "string"},
            },
            "required": ["x", "y"],
        },
    },
    {
        "name": "phone_swipe",
        "description": "Swipe on the Android phone screen (scroll, navigation).",
        "input_schema": {
            "type": "object",
            "properties": {
                "x1": {"type": "integer"}, "y1": {"type": "integer"},
                "x2": {"type": "integer"}, "y2": {"type": "integer"},
                "duration_ms": {"type": "integer", "description": "Swipe duration in ms"},
                "serial": {"type": "string"},
            },
            "required": ["x1", "y1", "x2", "y2"],
        },
    },
    {
        "name": "phone_type_text",
        "description": "Type text into the currently focused field on Android phone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "serial": {"type": "string"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "phone_press_key",
        "description": "Press a hardware key on Android. Keys: KEYCODE_HOME, KEYCODE_BACK, KEYCODE_POWER, KEYCODE_VOLUME_UP, KEYCODE_VOLUME_DOWN, KEYCODE_APP_SWITCH",
        "input_schema": {
            "type": "object",
            "properties": {
                "keycode": {"type": "string"},
                "serial": {"type": "string"},
            },
            "required": ["keycode"],
        },
    },
    {
        "name": "phone_launch_app",
        "description": "Launch an Android app by its package name (e.g. com.whatsapp, com.spotify.music).",
        "input_schema": {
            "type": "object",
            "properties": {
                "package_name": {"type": "string"},
                "serial": {"type": "string"},
            },
            "required": ["package_name"],
        },
    },
    {
        "name": "phone_get_notifications",
        "description": "Read current notifications on the Android phone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "serial": {"type": "string"},
            },
        },
    },
    {
        "name": "phone_launch_scrcpy",
        "description": "Launch scrcpy to show phone screen on laptop with full mouse/keyboard control. REQUIRES USER APPROVAL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "serial": {"type": "string"},
                "options": {"type": "string", "description": "Extra scrcpy flags e.g. '--max-size 1080 --bit-rate 4M'"},
            },
        },
    },
    {
        "name": "phone_connect_wireless",
        "description": "Connect to Android phone over WiFi. Phone must be on same network. REQUIRES USER APPROVAL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ip": {"type": "string", "description": "Phone's IP address"},
                "port": {"type": "integer", "description": "ADB port (default 5555)"},
            },
            "required": ["ip"],
        },
    },
]


def get_all_tools() -> list:
    return _TOOL_DEFINITIONS


async def execute_tool(tool_name: str, parameters: dict) -> Any:
    from tools.file_tools import FileTools
    from tools.system_tools import SystemTools
    from tools.code_tools import CodeTools
    from tools.desktop_tools import DesktopTools
    from tools.alert_tools import AlertTools
    from tools.phone_tools import PhoneTools

    tool_map = {
        "read_file": FileTools.read_file,
        "list_directory": FileTools.list_directory,
        "search_files": FileTools.search_files,
        "search_code": FileTools.search_code,
        "write_file": FileTools.write_file,
        "delete_file": FileTools.delete_file,
        "read_logs": FileTools.read_logs,
        "search_documents": FileTools.search_documents,
        "get_system_status": SystemTools.get_system_status,
        "get_disk_usage": SystemTools.get_disk_usage,
        "get_running_processes": SystemTools.get_running_processes,
        "check_port": SystemTools.check_port,
        "check_url_health": SystemTools.check_url_health,
        "get_network_info": SystemTools.get_network_info,
        "get_git_status": CodeTools.get_git_status,
        "get_git_diff": CodeTools.get_git_diff,
        "get_git_log": CodeTools.get_git_log,
        "git_commit": CodeTools.git_commit,
        "git_push": CodeTools.git_push,
        "run_npm_build": CodeTools.run_npm_build,
        "run_django_check": CodeTools.run_django_check,
        "run_django_test": CodeTools.run_django_test,
        "run_pytest": CodeTools.run_pytest,
        "run_command": CodeTools.run_command,
        "backup_database": CodeTools.backup_database,
        "explain_error": CodeTools.explain_error,
        "open_vscode": DesktopTools.open_vscode,
        "open_app": DesktopTools.open_app,
        "create_alert": AlertTools.create_alert,
        # New tools
        "web_search": lambda **kw: _get_search().web_search(**kw),
        "get_weather": lambda **kw: _get_search().get_weather(**kw),
        "capture_screen": lambda **kw: _get_screen().capture_screen(**kw),
        "analyze_screen": lambda **kw: _get_screen().analyze_screen(**kw),
        "remember": lambda **kw: _get_memory().remember(**kw),
        "recall": lambda **kw: _get_memory().recall(**kw),
        "recall_all": lambda **kw: _get_memory().recall_all(**kw),
        "forget": lambda **kw: _get_memory().forget(**kw),
        "speak": lambda **kw: _speak(**kw),
        "send_push_notification": lambda **kw: _send_push(**kw),
        # Intelligence tools
        "eli5": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.eli5(**kw),
        "fact_check": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.fact_check(**kw),
        "devils_advocate": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.devils_advocate(**kw),
        "first_principles": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.first_principles(**kw),
        "research_brief": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.research_brief(**kw),
        "book_summary": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.book_summary(**kw),
        "summarize_url": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.summarize_url(**kw),
        "check_patent": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.check_patent(**kw),
        "email_tone_check": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.email_tone_check(**kw),
        "negotiation_coach": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.negotiation_coach(**kw),
        "crisis_response": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.crisis_response(**kw),
        "presentation_builder": lambda **kw: __import__('tools.intelligence_tools', fromlist=['IntelligenceTools']).IntelligenceTools.presentation_builder(**kw),
        # Security tools
        "check_breach": lambda **kw: __import__('tools.security_tools', fromlist=['SecurityTools']).SecurityTools.check_breach(**kw),
        "check_vpn": lambda **kw: __import__('tools.security_tools', fromlist=['SecurityTools']).SecurityTools.check_vpn(),
        "audit_app_permissions": lambda **kw: __import__('tools.security_tools', fromlist=['SecurityTools']).SecurityTools.audit_app_permissions(),
        # Focus Shield
        "activate_focus_shield": lambda **kw: _activate_focus(**kw),
        "deactivate_focus_shield": lambda **kw: _deactivate_focus(),
        "set_dnd": lambda **kw: _set_dnd(**kw),
        "clear_dnd": lambda **kw: _clear_dnd(),
        # System control — lazy import to avoid pyautogui blocking startup
        "create_folder":    lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.create_folder(**kw),
        "create_file":      lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.create_file(**kw),
        "move_file":        lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.move_file(**kw),
        "copy_file":        lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.copy_file(**kw),
        "delete_file":      lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.delete_file(**kw),
        "delete_folder":    lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.delete_folder(**kw),
        "list_files":       lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.list_files(**kw),
        "find_large_files": lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.find_large_files(**kw),
        "kill_process":     lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.kill_process(**kw),
        "sleep_system":     lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.sleep_system(),
        "lock_screen":      lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.lock_screen(),
        "shutdown":         lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.shutdown(**kw),
        "restart":          lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.restart(**kw),
        "cancel_shutdown":  lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.cancel_shutdown(),
        "set_brightness":   lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.set_brightness(**kw),
        "set_volume_sys":   lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.set_volume(**kw),
        "mute_system":      lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.mute_system(),
        "open_app":         lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.open_app(**kw),
        "type_text_sys":    lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.type_text(**kw),
        "take_screenshot_sys": lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.take_screenshot(**kw),
        "get_network_speed":  lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.get_network_speed(),
        "flush_dns":          lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.flush_dns(),
        "empty_recycle_bin":  lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.empty_recycle_bin(),
        "clear_temp_files":   lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.clear_temp_files(),
        "get_full_system_info": lambda **kw: __import__('tools.system_control',fromlist=['SystemControl']).SystemControl.get_full_system_info(),
        # YouTube DJ
        "play_music": lambda **kw: __import__('tools.youtube_dj', fromlist=['YoutubeDJ']).YoutubeDJ.search_and_play(**kw),
        "pause_music": lambda **kw: __import__('tools.youtube_dj', fromlist=['YoutubeDJ']).YoutubeDJ.pause(),
        "next_track": lambda **kw: __import__('tools.youtube_dj', fromlist=['YoutubeDJ']).YoutubeDJ.next_track(),
        "set_volume": lambda **kw: __import__('tools.youtube_dj', fromlist=['YoutubeDJ']).YoutubeDJ.set_volume(**kw),
        # Twitter
        "post_tweet": lambda **kw: _post_tweet_sync(**kw),
        "get_twitter_stats": lambda **kw: __import__('tools.twitter_autoposter', fromlist=['get_twitter_stats']).get_twitter_stats(),
        "get_calendar_events": lambda **kw: _get_calendar().get_calendar_events(**kw),
        "get_gmail_inbox": lambda **kw: _get_calendar().get_gmail_inbox(**kw),
        "send_email": lambda **kw: _get_calendar().send_gmail(**kw),
        # Phone tools
        "phone_list_devices": PhoneTools.list_devices,
        "phone_screenshot": PhoneTools.screenshot,
        "phone_get_info": PhoneTools.get_phone_info,
        "phone_tap": PhoneTools.tap,
        "phone_swipe": PhoneTools.swipe,
        "phone_type_text": PhoneTools.type_text,
        "phone_press_key": PhoneTools.press_key,
        "phone_launch_app": PhoneTools.launch_app,
        "phone_get_notifications": PhoneTools.get_notifications,
        "phone_launch_scrcpy": PhoneTools.launch_scrcpy,
        "phone_connect_wireless": PhoneTools.connect_wireless,
    }

    handler = tool_map.get(tool_name)
    if not handler:
        return f"Unknown tool: {tool_name}"

    return await handler(**parameters)
