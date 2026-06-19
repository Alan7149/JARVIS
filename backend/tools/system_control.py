"""
JARVIS Full System Control
Complete Windows control — file management, processes, power, display, network, apps.
Critical actions require confirmation before executing.
"""
import asyncio
import logging
import os
import shutil
import subprocess
import sys
import winreg
from pathlib import Path
from typing import Any

import psutil

logger = logging.getLogger("jarvis.sysctl")

# Actions that REQUIRE user confirmation before executing
REQUIRES_CONFIRM = {
    "delete_file", "delete_folder", "shutdown", "restart", "kill_process",
    "format_drive", "edit_registry", "run_as_admin", "install_software",
    "uninstall_software", "modify_hosts", "firewall_rule"
}

_pending_confirmations: dict[str, dict] = {}


def _run(cmd: list[str], timeout: int = 10) -> tuple[str, str, int]:
    """Run a command and return stdout, stderr, returncode."""
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    )
    return result.stdout, result.stderr, result.returncode


class SystemControl:

    # ── File System ─────────────────────────────────────────────────────────

    @staticmethod
    async def create_folder(path: str) -> dict[str, Any]:
        Path(path).mkdir(parents=True, exist_ok=True)
        return {"created": True, "path": path}

    @staticmethod
    async def create_file(path: str, content: str = "") -> dict[str, Any]:
        Path(path).write_text(content, encoding="utf-8")
        return {"created": True, "path": path}

    @staticmethod
    async def move_file(src: str, dst: str) -> dict[str, Any]:
        shutil.move(src, dst)
        return {"moved": True, "from": src, "to": dst}

    @staticmethod
    async def copy_file(src: str, dst: str) -> dict[str, Any]:
        shutil.copy2(src, dst)
        return {"copied": True, "from": src, "to": dst}

    @staticmethod
    async def delete_file(path: str, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            return {"requires_confirmation": True, "action": "delete_file", "path": path,
                    "message": f"Permanently delete {path}?"}
        Path(path).unlink(missing_ok=True)
        return {"deleted": True, "path": path}

    @staticmethod
    async def delete_folder(path: str, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            return {"requires_confirmation": True, "action": "delete_folder", "path": path,
                    "message": f"Permanently delete folder {path} and ALL contents?"}
        shutil.rmtree(path, ignore_errors=True)
        return {"deleted": True, "path": path}

    @staticmethod
    async def list_files(path: str, pattern: str = "*") -> dict[str, Any]:
        p = Path(path)
        if not p.exists():
            return {"error": f"Path not found: {path}"}
        files = []
        for f in sorted(p.glob(pattern))[:50]:
            stat = f.stat()
            files.append({
                "name": f.name, "type": "dir" if f.is_dir() else "file",
                "size": stat.st_size if f.is_file() else 0,
                "modified": stat.st_mtime,
            })
        return {"path": path, "files": files, "count": len(files)}

    @staticmethod
    async def find_large_files(path: str, min_mb: int = 100) -> dict[str, Any]:
        results = []
        for f in Path(path).rglob("*"):
            if f.is_file():
                try:
                    size_mb = f.stat().st_size / 1024 / 1024
                    if size_mb >= min_mb:
                        results.append({"path": str(f), "size_mb": round(size_mb, 1)})
                except Exception:
                    pass
        results.sort(key=lambda x: -x["size_mb"])
        return {"large_files": results[:20], "min_mb": min_mb}

    # ── Process Management ──────────────────────────────────────────────────

    @staticmethod
    async def list_processes(top: int = 20, sort_by: str = "cpu") -> dict[str, Any]:
        procs = []
        for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
            try:
                procs.append({
                    "pid": p.info['pid'], "name": p.info['name'],
                    "cpu": round(p.info['cpu_percent'] or 0, 1),
                    "mem": round(p.info['memory_percent'] or 0, 1),
                    "status": p.info['status'],
                })
            except Exception:
                pass
        procs.sort(key=lambda x: -x.get(sort_by if sort_by in ("cpu","mem") else "cpu", 0))
        return {"processes": procs[:top]}

    @staticmethod
    async def kill_process(pid: int = 0, name: str = "", confirmed: bool = False) -> dict[str, Any]:
        target = name or str(pid)
        if not confirmed:
            return {"requires_confirmation": True, "action": "kill_process",
                    "message": f"Kill process '{target}'? This cannot be undone."}
        if pid:
            psutil.Process(pid).kill()
            return {"killed": True, "pid": pid}
        killed = []
        for p in psutil.process_iter(['pid', 'name']):
            if name.lower() in p.info['name'].lower():
                p.kill()
                killed.append(p.info['pid'])
        return {"killed": killed, "name": name}

    @staticmethod
    async def start_process(path: str, args: list[str] = None) -> dict[str, Any]:
        subprocess.Popen([path] + (args or []), creationflags=subprocess.CREATE_NO_WINDOW)
        return {"started": True, "path": path}

    # ── System Power ────────────────────────────────────────────────────────

    @staticmethod
    async def sleep_system() -> dict[str, Any]:
        subprocess.run(["rundll32.exe", "powrprof.dll,SetSuspendState", "0", "1", "0"],
                       creationflags=subprocess.CREATE_NO_WINDOW)
        return {"sleeping": True}

    @staticmethod
    async def lock_screen() -> dict[str, Any]:
        subprocess.run(["rundll32.exe", "user32.dll,LockWorkStation"],
                       creationflags=subprocess.CREATE_NO_WINDOW)
        return {"locked": True}

    @staticmethod
    async def shutdown(delay_seconds: int = 30, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            return {"requires_confirmation": True, "action": "shutdown",
                    "message": f"Shut down the computer in {delay_seconds} seconds?"}
        subprocess.run(["shutdown", "/s", "/t", str(delay_seconds)],
                       creationflags=subprocess.CREATE_NO_WINDOW)
        return {"shutdown_scheduled": True, "in_seconds": delay_seconds}

    @staticmethod
    async def restart(delay_seconds: int = 30, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            return {"requires_confirmation": True, "action": "restart",
                    "message": f"Restart the computer in {delay_seconds} seconds?"}
        subprocess.run(["shutdown", "/r", "/t", str(delay_seconds)],
                       creationflags=subprocess.CREATE_NO_WINDOW)
        return {"restart_scheduled": True, "in_seconds": delay_seconds}

    @staticmethod
    async def cancel_shutdown() -> dict[str, Any]:
        subprocess.run(["shutdown", "/a"], creationflags=subprocess.CREATE_NO_WINDOW)
        return {"cancelled": True}

    # ── Display & Volume ────────────────────────────────────────────────────

    @staticmethod
    async def set_brightness(level: int) -> dict[str, Any]:
        level = max(0, min(100, level))
        subprocess.run(
            ["powershell", "-Command",
             f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, {level})"],
            creationflags=subprocess.CREATE_NO_WINDOW, timeout=5
        )
        return {"brightness": level}

    @staticmethod
    async def set_volume(level: int) -> dict[str, Any]:
        level = max(0, min(100, level))
        script = f"$obj = New-Object -ComObject WScript.Shell; " + \
                 "for($i=0;$i -lt 50;$i++){$obj.SendKeys([char]174)}; " + \
                 f"$steps = [math]::Round({level}/2); " + \
                 "for($i=0;$i -lt $steps;$i++){$obj.SendKeys([char]175)}"
        subprocess.Popen(["powershell", "-WindowStyle", "Hidden", "-Command", script],
                         creationflags=subprocess.CREATE_NO_WINDOW)
        return {"volume": level}

    @staticmethod
    async def mute_system() -> dict[str, Any]:
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command",
             "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)"],
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        return {"muted": True}

    # ── App Management ──────────────────────────────────────────────────────

    @staticmethod
    async def open_app(app_name: str) -> dict[str, Any]:
        apps = {
            "notepad": "notepad.exe", "calculator": "calc.exe", "paint": "mspaint.exe",
            "chrome": "chrome.exe", "firefox": "firefox.exe", "edge": "msedge.exe",
            "explorer": "explorer.exe", "task manager": "taskmgr.exe",
            "control panel": "control.exe", "settings": "ms-settings:",
            "cmd": "cmd.exe", "powershell": "powershell.exe",
            "vs code": "code", "cursor": "cursor",
        }
        exe = apps.get(app_name.lower(), app_name)
        subprocess.Popen(exe, shell=True, creationflags=subprocess.CREATE_NO_WINDOW)
        return {"opened": exe, "app": app_name}

    @staticmethod
    async def get_installed_apps() -> dict[str, Any]:
        apps = []
        try:
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                  r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
            for i in range(winreg.QueryInfoKey(key)[0]):
                try:
                    sub = winreg.OpenKey(key, winreg.EnumKey(key, i))
                    name, _ = winreg.QueryValueEx(sub, "DisplayName")
                    apps.append(name)
                except Exception:
                    pass
        except Exception:
            pass
        return {"apps": sorted(set(apps))[:50], "total": len(apps)}

    # ── Network ─────────────────────────────────────────────────────────────

    @staticmethod
    async def get_wifi_networks() -> dict[str, Any]:
        out, _, _ = _run(["netsh", "wlan", "show", "networks"])
        networks = []
        for line in out.split('\n'):
            if 'SSID' in line and 'BSSID' not in line:
                name = line.split(':',1)[-1].strip()
                if name:
                    networks.append(name)
        return {"networks": networks}

    @staticmethod
    async def get_network_speed() -> dict[str, Any]:
        io1 = psutil.net_io_counters()
        await asyncio.sleep(1)
        io2 = psutil.net_io_counters()
        return {
            "download_mbps": round((io2.bytes_recv - io1.bytes_recv) / 1024 / 1024 * 8, 2),
            "upload_mbps": round((io2.bytes_sent - io1.bytes_sent) / 1024 / 1024 * 8, 2),
        }

    @staticmethod
    async def flush_dns() -> dict[str, Any]:
        out, err, code = _run(["ipconfig", "/flushdns"])
        return {"flushed": code == 0, "output": out.strip()}

    @staticmethod
    async def get_ip_info() -> dict[str, Any]:
        addrs = {}
        for name, addrs_list in psutil.net_if_addrs().items():
            for addr in addrs_list:
                if addr.family.name == 'AF_INET':
                    addrs[name] = addr.address
        return {"interfaces": addrs}

    # ── Mouse & Keyboard ────────────────────────────────────────────────────

    @staticmethod
    async def type_text(text: str) -> dict[str, Any]:
        import pyautogui
        pyautogui.typewrite(text, interval=0.03)
        return {"typed": True, "length": len(text)}

    @staticmethod
    async def press_hotkey(*keys: str) -> dict[str, Any]:
        import pyautogui
        pyautogui.hotkey(*keys)
        return {"keys": keys}

    @staticmethod
    async def take_screenshot(save_path: str = None) -> dict[str, Any]:
        import pyautogui, tempfile
        if not save_path:
            save_path = str(Path(tempfile.gettempdir()) / "jarvis_screenshot.png")
        pyautogui.screenshot(save_path)
        return {"saved": save_path}

    # ── System Info ─────────────────────────────────────────────────────────

    @staticmethod
    async def get_full_system_info() -> dict[str, Any]:
        cpu = psutil.cpu_percent(interval=1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('C:/')
        battery = psutil.sensors_battery()
        return {
            "cpu_percent": cpu,
            "cpu_cores": psutil.cpu_count(),
            "ram_total_gb": round(mem.total / 1e9, 1),
            "ram_used_gb": round(mem.used / 1e9, 1),
            "ram_percent": mem.percent,
            "disk_total_gb": round(disk.total / 1e9, 1),
            "disk_free_gb": round(disk.free / 1e9, 1),
            "disk_percent": disk.percent,
            "battery_percent": battery.percent if battery else None,
            "plugged_in": battery.power_plugged if battery else None,
            "uptime_hours": round((psutil.time.time() - psutil.boot_time()) / 3600, 1),
        }

    @staticmethod
    async def empty_recycle_bin() -> dict[str, Any]:
        import ctypes
        ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, 1)
        return {"emptied": True}

    @staticmethod
    async def clear_temp_files() -> dict[str, Any]:
        temp = Path(os.environ.get('TEMP', 'C:/Windows/Temp'))
        deleted = 0
        for f in temp.iterdir():
            try:
                if f.is_file():
                    f.unlink()
                    deleted += 1
            except Exception:
                pass
        return {"deleted_files": deleted, "temp_path": str(temp)}
