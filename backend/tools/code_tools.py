import asyncio
import os
import subprocess
from pathlib import Path
from typing import Optional

from core.permissions import is_command_allowed


async def _run(cmd: list[str], cwd: str | None = None, timeout: int = 60) -> tuple[str, str, int]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace"), proc.returncode
    except asyncio.TimeoutError:
        proc.kill()
        return "", "Command timed out", -1


class CodeTools:

    @staticmethod
    async def get_git_status(repo_path: str) -> str:
        stdout, stderr, rc = await _run(["git", "status"], cwd=repo_path)
        return stdout or stderr

    @staticmethod
    async def get_git_diff(repo_path: str, staged: bool = False) -> str:
        cmd = ["git", "diff"]
        if staged:
            cmd.append("--staged")
        stdout, stderr, rc = await _run(cmd, cwd=repo_path)
        if not stdout.strip():
            return "No changes detected."
        lines = stdout.split("\n")[:200]
        return "\n".join(lines)

    @staticmethod
    async def get_git_log(repo_path: str, limit: int = 20) -> str:
        stdout, stderr, rc = await _run(
            ["git", "log", "--oneline", f"-{limit}", "--decorate"],
            cwd=repo_path,
        )
        return stdout or stderr

    @staticmethod
    async def git_commit(repo_path: str, message: str) -> str:
        stdout, stderr, rc = await _run(["git", "commit", "-m", message], cwd=repo_path)
        if rc == 0:
            return f"Committed successfully:\n{stdout}"
        return f"Commit failed:\n{stderr}"

    @staticmethod
    async def git_push(repo_path: str, branch: Optional[str] = None) -> str:
        cmd = ["git", "push"]
        if branch:
            cmd += ["origin", branch]
        stdout, stderr, rc = await _run(cmd, cwd=repo_path, timeout=120)
        if rc == 0:
            return f"Pushed successfully:\n{stdout}"
        return f"Push failed:\n{stderr}"

    @staticmethod
    async def run_npm_build(project_path: str, script: str = "build") -> str:
        stdout, stderr, rc = await _run(["npm", "run", script], cwd=project_path, timeout=120)
        if rc == 0:
            return f"Build succeeded:\n{stdout[-2000:]}"
        return f"Build failed (exit {rc}):\n{stderr[-2000:]}"

    @staticmethod
    async def run_django_check(project_path: str) -> str:
        stdout, stderr, rc = await _run(
            ["python", "manage.py", "check"],
            cwd=project_path,
        )
        return stdout + stderr

    @staticmethod
    async def run_django_test(project_path: str, test_module: Optional[str] = None) -> str:
        cmd = ["python", "manage.py", "test"]
        if test_module:
            cmd.append(test_module)
        stdout, stderr, rc = await _run(cmd, cwd=project_path, timeout=300)
        return (stdout + stderr)[-3000:]

    @staticmethod
    async def run_pytest(project_path: str, test_path: Optional[str] = None, flags: Optional[str] = None) -> str:
        cmd = ["pytest", "-v"]
        if test_path:
            cmd.append(test_path)
        if flags:
            cmd.extend(flags.split())
        stdout, stderr, rc = await _run(cmd, cwd=project_path, timeout=300)
        return (stdout + stderr)[-3000:]

    @staticmethod
    async def run_command(command: str, working_dir: Optional[str] = None) -> str:
        if not is_command_allowed(command):
            return (
                f"Command not in allowlist: '{command}'\n"
                "Only pre-approved commands are permitted for safety. "
                "Contact the administrator to add new allowed commands."
            )
        parts = command.split()
        stdout, stderr, rc = await _run(parts, cwd=working_dir)
        result = (stdout + stderr).strip()
        return result[:3000] if result else f"Command completed with exit code {rc}"

    @staticmethod
    async def backup_database(database_name: str, output_path: str) -> str:
        cmd = ["pg_dump", "-Fc", "-f", output_path, database_name]
        stdout, stderr, rc = await _run(cmd, timeout=300)
        if rc == 0:
            size = Path(output_path).stat().st_size if Path(output_path).exists() else 0
            return f"Database backup complete.\nOutput: {output_path}\nSize: {size/1e6:.2f} MB"
        return f"Backup failed:\n{stderr}"

    @staticmethod
    async def explain_error(error_text: str, context: Optional[str] = None) -> str:
        # Returns the error to Claude for analysis — Claude itself will explain it
        ctx = f"\nContext: {context}" if context else ""
        return (
            f"Error to analyze:{ctx}\n\n```\n{error_text}\n```\n\n"
            "(Analyze the above error and explain the cause and recommended fix.)"
        )
