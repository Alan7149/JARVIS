from enum import IntEnum
from typing import Dict


class PermissionLevel(IntEnum):
    READ_ONLY = 1
    SAFE_ACTION = 2
    REQUIRES_CONFIRMATION = 3
    BLOCKED = 4


TOOL_PERMISSIONS: Dict[str, PermissionLevel] = {
    # Level 1 — Read only
    "read_file": PermissionLevel.READ_ONLY,
    "search_files": PermissionLevel.READ_ONLY,
    "search_code": PermissionLevel.READ_ONLY,
    "get_system_status": PermissionLevel.READ_ONLY,
    "get_disk_usage": PermissionLevel.READ_ONLY,
    "get_cpu_memory": PermissionLevel.READ_ONLY,
    "get_running_processes": PermissionLevel.READ_ONLY,
    "get_git_status": PermissionLevel.READ_ONLY,
    "get_git_diff": PermissionLevel.READ_ONLY,
    "get_git_log": PermissionLevel.READ_ONLY,
    "list_directory": PermissionLevel.READ_ONLY,
    "get_network_info": PermissionLevel.READ_ONLY,
    "check_port": PermissionLevel.READ_ONLY,
    "check_url_health": PermissionLevel.READ_ONLY,
    "explain_error": PermissionLevel.READ_ONLY,
    "read_logs": PermissionLevel.READ_ONLY,
    "search_documents": PermissionLevel.READ_ONLY,

    # Level 1 — Read only (new tools)
    "web_search": PermissionLevel.READ_ONLY,
    "get_weather": PermissionLevel.READ_ONLY,
    "capture_screen": PermissionLevel.READ_ONLY,
    "analyze_screen": PermissionLevel.READ_ONLY,
    "recall": PermissionLevel.READ_ONLY,
    "recall_all": PermissionLevel.READ_ONLY,
    "get_calendar_events": PermissionLevel.READ_ONLY,
    "get_gmail_inbox": PermissionLevel.READ_ONLY,

    # Level 2 — Safe actions (new tools)
    "remember": PermissionLevel.SAFE_ACTION,
    "forget": PermissionLevel.SAFE_ACTION,
    "speak": PermissionLevel.SAFE_ACTION,
    "send_push_notification": PermissionLevel.SAFE_ACTION,

    # Level 3 — Requires confirmation (new tools)
    "send_email": PermissionLevel.REQUIRES_CONFIRMATION,

    # Level 2 — Safe actions
    "run_npm_build": PermissionLevel.SAFE_ACTION,
    "run_npm_install": PermissionLevel.SAFE_ACTION,
    "run_django_check": PermissionLevel.SAFE_ACTION,
    "run_django_test": PermissionLevel.SAFE_ACTION,
    "run_pytest": PermissionLevel.SAFE_ACTION,
    "run_lint": PermissionLevel.SAFE_ACTION,
    "open_vscode": PermissionLevel.SAFE_ACTION,
    "open_app": PermissionLevel.SAFE_ACTION,
    "create_alert": PermissionLevel.SAFE_ACTION,
    "index_files": PermissionLevel.SAFE_ACTION,
    "write_file": PermissionLevel.SAFE_ACTION,

    # Level 3 — Requires confirmation
    "run_command": PermissionLevel.REQUIRES_CONFIRMATION,
    "restart_dev_server": PermissionLevel.REQUIRES_CONFIRMATION,
    "git_commit": PermissionLevel.REQUIRES_CONFIRMATION,
    "git_push": PermissionLevel.REQUIRES_CONFIRMATION,
    "create_migration": PermissionLevel.REQUIRES_CONFIRMATION,
    "run_migration": PermissionLevel.REQUIRES_CONFIRMATION,
    "delete_file": PermissionLevel.REQUIRES_CONFIRMATION,
    "send_email": PermissionLevel.REQUIRES_CONFIRMATION,
    "send_notification": PermissionLevel.REQUIRES_CONFIRMATION,
    "backup_database": PermissionLevel.REQUIRES_CONFIRMATION,
    "kill_process": PermissionLevel.REQUIRES_CONFIRMATION,

    # Phone tools — Level 1 (read)
    "phone_list_devices": PermissionLevel.READ_ONLY,
    "phone_get_info": PermissionLevel.READ_ONLY,
    "phone_screenshot": PermissionLevel.READ_ONLY,
    "phone_get_notifications": PermissionLevel.READ_ONLY,
    "phone_battery": PermissionLevel.READ_ONLY,
    # Phone tools — Level 2 (safe action)
    "phone_press_key": PermissionLevel.SAFE_ACTION,
    "phone_tap": PermissionLevel.SAFE_ACTION,
    "phone_swipe": PermissionLevel.SAFE_ACTION,
    "phone_type_text": PermissionLevel.SAFE_ACTION,
    "phone_launch_app": PermissionLevel.SAFE_ACTION,
    # Phone tools — Level 3 (confirm)
    "phone_launch_scrcpy": PermissionLevel.REQUIRES_CONFIRMATION,
    "phone_connect_wireless": PermissionLevel.REQUIRES_CONFIRMATION,

    # Level 4 — Blocked
    "drop_database": PermissionLevel.BLOCKED,
    "format_disk": PermissionLevel.BLOCKED,
    "upload_private_files": PermissionLevel.BLOCKED,
    "send_passwords": PermissionLevel.BLOCKED,
    "delete_directory": PermissionLevel.BLOCKED,
    "modify_system_files": PermissionLevel.BLOCKED,
    "execute_arbitrary_code": PermissionLevel.BLOCKED,
}

ALLOWED_COMMANDS = [
    "dir", "ls",
    "ipconfig", "ifconfig",
    "git status",
    "git diff",
    "git log --oneline -20",
    "git branch",
    "npm run build",
    "npm run test",
    "npm run lint",
    "python manage.py check",
    "python manage.py test",
    "python manage.py showmigrations",
    "python manage.py diffsettings",
    "pytest",
    "pip list",
    "pip show",
    "node --version",
    "python --version",
    "pg_dump --version",
    "systeminfo",
    "tasklist",
    "netstat -an",
]


def check_permission(tool_name: str) -> PermissionLevel:
    return TOOL_PERMISSIONS.get(tool_name, PermissionLevel.REQUIRES_CONFIRMATION)


def is_command_allowed(command: str) -> bool:
    cmd_lower = command.strip().lower()
    return any(cmd_lower.startswith(allowed.lower()) for allowed in ALLOWED_COMMANDS)


def requires_approval(tool_name: str) -> bool:
    level = check_permission(tool_name)
    return level == PermissionLevel.REQUIRES_CONFIRMATION


def is_blocked(tool_name: str) -> bool:
    level = check_permission(tool_name)
    return level == PermissionLevel.BLOCKED
