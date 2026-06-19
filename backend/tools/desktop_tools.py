import asyncio
import subprocess
import sys


class DesktopTools:

    @staticmethod
    async def open_vscode(path: str) -> str:
        try:
            proc = await asyncio.create_subprocess_exec(
                "code", path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            if proc.returncode and proc.returncode != 0:
                return f"VS Code opened with warning: {stderr.decode()}"
            return f"Opened in VS Code: {path}"
        except FileNotFoundError:
            return "VS Code CLI ('code') not found. Is it installed and in PATH?"
        except asyncio.TimeoutError:
            return f"VS Code launch initiated for: {path}"
        except Exception as e:
            return f"Error opening VS Code: {e}"

    @staticmethod
    async def open_app(app_name: str) -> str:
        try:
            if sys.platform == "win32":
                proc = await asyncio.create_subprocess_exec(
                    "start", "", app_name,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                    shell=True,
                )
            elif sys.platform == "darwin":
                proc = await asyncio.create_subprocess_exec(
                    "open", "-a", app_name,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                )
            else:
                proc = await asyncio.create_subprocess_exec(
                    app_name,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                )
            await asyncio.wait_for(proc.communicate(), timeout=5)
            return f"Launched: {app_name}"
        except asyncio.TimeoutError:
            return f"Launch initiated: {app_name}"
        except Exception as e:
            return f"Error opening {app_name}: {e}"
