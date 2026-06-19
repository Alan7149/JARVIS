"""
Android phone control via ADB.
Requires: adb in PATH (Android Platform Tools).
Connect phone: enable USB debugging, or use wireless ADB.
"""

import asyncio
import base64
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger("jarvis.phone")


async def _adb(args: list[str], timeout: int = 15, serial: str | None = None) -> tuple[str, str, int]:
    cmd = ["adb"]
    if serial:
        cmd += ["-s", serial]
    cmd.extend(args)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace"), proc.returncode
    except asyncio.TimeoutError:
        proc.kill()
        return "", "Timeout", -1


class PhoneTools:

    @staticmethod
    async def list_devices() -> str:
        stdout, stderr, rc = await _adb(["devices", "-l"])
        if rc != 0:
            return f"ADB error: {stderr}\nIs ADB installed? Download Android Platform Tools and add to PATH."
        return stdout

    @staticmethod
    async def get_phone_info(serial: str | None = None) -> str:
        props = {
            "Model": ["shell", "getprop", "ro.product.model"],
            "Brand": ["shell", "getprop", "ro.product.brand"],
            "Android": ["shell", "getprop", "ro.build.version.release"],
            "Battery": ["shell", "dumpsys", "battery"],
        }
        lines = []
        for label, args in props.items():
            stdout, _, rc = await _adb(args, serial=serial)
            if label == "Battery":
                for line in stdout.split("\n"):
                    if "level" in line or "status" in line or "plugged" in line:
                        lines.append(f"  {line.strip()}")
            else:
                lines.append(f"{label}: {stdout.strip()}")
        return "\n".join(lines)

    @staticmethod
    async def screenshot(serial: str | None = None) -> dict:
        """Returns base64-encoded PNG screenshot."""
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name

        stdout, stderr, rc = await _adb(
            ["exec-out", "screencap", "-p"],
            serial=serial,
            timeout=10,
        )
        if rc != 0 or not stdout:
            # Try pulling method
            await _adb(["shell", "screencap", "-p", "/sdcard/jarvis_screen.png"], serial=serial)
            await _adb(["pull", "/sdcard/jarvis_screen.png", tmp_path], serial=serial)
            with open(tmp_path, "rb") as f:
                image_bytes = f.read()
            os.unlink(tmp_path)
        else:
            image_bytes = stdout.encode("latin-1") if isinstance(stdout, str) else stdout

        # Re-run properly with binary output
        proc = await asyncio.create_subprocess_exec(
            "adb", *(["-s", serial] if serial else []), "exec-out", "screencap", "-p",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=10)

        if proc.returncode == 0 and stdout_bytes:
            b64 = base64.b64encode(stdout_bytes).decode("utf-8")
            return {"success": True, "image_base64": b64, "format": "png"}
        return {"success": False, "error": stderr_bytes.decode(errors="replace")}

    @staticmethod
    async def tap(x: int, y: int, serial: str | None = None) -> str:
        stdout, stderr, rc = await _adb(["shell", "input", "tap", str(x), str(y)], serial=serial)
        return "Tap executed" if rc == 0 else f"Tap failed: {stderr}"

    @staticmethod
    async def swipe(x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300, serial: str | None = None) -> str:
        stdout, stderr, rc = await _adb(
            ["shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(duration_ms)],
            serial=serial,
        )
        return "Swipe executed" if rc == 0 else f"Swipe failed: {stderr}"

    @staticmethod
    async def type_text(text: str, serial: str | None = None) -> str:
        escaped = text.replace(" ", "%s").replace("'", "\\'").replace('"', '\\"')
        stdout, stderr, rc = await _adb(["shell", "input", "text", escaped], serial=serial)
        return "Text input sent" if rc == 0 else f"Failed: {stderr}"

    @staticmethod
    async def press_key(keycode: str, serial: str | None = None) -> str:
        """Press hardware key. Common keycodes: KEYCODE_HOME, KEYCODE_BACK, KEYCODE_POWER, KEYCODE_VOLUME_UP/DOWN"""
        stdout, stderr, rc = await _adb(["shell", "input", "keyevent", keycode], serial=serial)
        return f"Key {keycode} pressed" if rc == 0 else f"Failed: {stderr}"

    @staticmethod
    async def launch_app(package_name: str, serial: str | None = None) -> str:
        """Launch app by package name. E.g. com.whatsapp, com.spotify.music"""
        stdout, stderr, rc = await _adb(
            ["shell", "monkey", "-p", package_name, "-c", "android.intent.category.LAUNCHER", "1"],
            serial=serial,
        )
        if rc == 0:
            return f"Launched {package_name}"
        # Try intent method
        stdout2, stderr2, rc2 = await _adb(
            ["shell", "am", "start", "-n", f"{package_name}/.MainActivity"],
            serial=serial,
        )
        return f"Launch attempted: {stdout2}" if rc2 == 0 else f"Failed: {stderr}, {stderr2}"

    @staticmethod
    async def list_installed_apps(serial: str | None = None) -> str:
        stdout, stderr, rc = await _adb(["shell", "pm", "list", "packages", "-3"], serial=serial)
        if rc != 0:
            return f"Error: {stderr}"
        packages = [line.replace("package:", "").strip() for line in stdout.split("\n") if line.strip()]
        return "\n".join(sorted(packages))

    @staticmethod
    async def get_notifications(serial: str | None = None) -> str:
        stdout, stderr, rc = await _adb(
            ["shell", "dumpsys", "notification", "--noredact"],
            serial=serial,
            timeout=15,
        )
        if rc != 0:
            return f"Error: {stderr}"
        # Extract notification text from dump
        lines = stdout.split("\n")
        relevant = []
        capture = False
        for line in lines:
            if "NotificationRecord" in line:
                capture = True
            if capture and ("pkg=" in line or "title=" in line or "text=" in line):
                relevant.append(line.strip())
            if capture and len(relevant) > 100:
                break
        return "\n".join(relevant[:50]) if relevant else "No notifications found or access denied."

    @staticmethod
    async def send_text_message(phone_number: str, message: str, serial: str | None = None) -> str:
        """Open SMS app with pre-filled message."""
        encoded_msg = message.replace(" ", "%20")
        uri = f"sms:{phone_number}?body={encoded_msg}"
        stdout, stderr, rc = await _adb(
            ["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", uri],
            serial=serial,
        )
        return "SMS app opened with message" if rc == 0 else f"Failed: {stderr}"

    @staticmethod
    async def set_volume(level: int, stream: str = "music", serial: str | None = None) -> str:
        """Set volume 0-15. Streams: music, ring, alarm, notification"""
        stdout, stderr, rc = await _adb(
            ["shell", "media", "volume", "--set", str(level), "--stream", stream],
            serial=serial,
        )
        return f"Volume set to {level}" if rc == 0 else f"Failed: {stderr}"

    @staticmethod
    async def get_battery_status(serial: str | None = None) -> str:
        stdout, stderr, rc = await _adb(["shell", "dumpsys", "battery"], serial=serial)
        if rc != 0:
            return f"Error: {stderr}"
        lines = [l.strip() for l in stdout.split("\n") if l.strip() and ":" in l]
        return "\n".join(lines[:15])

    @staticmethod
    async def push_file(local_path: str, remote_path: str, serial: str | None = None) -> str:
        stdout, stderr, rc = await _adb(["push", local_path, remote_path], serial=serial, timeout=60)
        return f"Pushed to {remote_path}" if rc == 0 else f"Failed: {stderr}"

    @staticmethod
    async def pull_file(remote_path: str, local_path: str, serial: str | None = None) -> str:
        stdout, stderr, rc = await _adb(["pull", remote_path, local_path], serial=serial, timeout=60)
        return f"Pulled to {local_path}" if rc == 0 else f"Failed: {stderr}"

    @staticmethod
    async def run_shell_command(command: str, serial: str | None = None) -> str:
        """Run an adb shell command. Use with care."""
        stdout, stderr, rc = await _adb(["shell", command], serial=serial)
        return (stdout + stderr).strip()

    @staticmethod
    async def launch_scrcpy(serial: str | None = None, options: str = "") -> str:
        """Launch scrcpy for full screen mirroring and mouse/keyboard control."""
        try:
            cmd = ["scrcpy"]
            if serial:
                cmd += ["-s", serial]
            if options:
                cmd.extend(options.split())
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.sleep(1)
            if proc.returncode is None:
                return f"scrcpy launched successfully. Control your phone via the window that opened."
            _, stderr = await proc.communicate()
            return f"scrcpy failed: {stderr.decode()}\nInstall from: https://github.com/Genymobile/scrcpy"
        except FileNotFoundError:
            return (
                "scrcpy not found. Install it:\n"
                "  winget install Genymobile.scrcpy\n"
                "Then reconnect your phone via USB with debugging enabled."
            )

    @staticmethod
    async def connect_wireless(ip: str, port: int = 5555, serial: str | None = None) -> str:
        """Connect to Android phone over WiFi (same network required)."""
        # First pair if needed
        stdout, stderr, rc = await _adb(["connect", f"{ip}:{port}"])
        if "connected" in stdout.lower():
            return f"Connected to {ip}:{port}"
        return f"Connection result: {stdout}{stderr}"
