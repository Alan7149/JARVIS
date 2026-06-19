"""
JARVIS Security Suite
- Dark web breach check (HaveIBeenPwned)
- Password strength audit
- App permission auditor
- Suspicious process detector
- VPN status checker
"""
import logging
import re
import subprocess
from typing import Any

import httpx
import psutil

logger = logging.getLogger("jarvis.security")

SUSPICIOUS_PROCESS_PATTERNS = [
    r"keylog", r"spyware", r"miner", r"crypto", r"trojan",
    r"backdoor", r"rootkit", r"ransomware",
]

KNOWN_SAFE = {
    "chrome", "firefox", "msedge", "code", "cursor", "python", "node",
    "explorer", "svchost", "system", "lsass", "winlogon", "csrss",
    "dwm", "taskmgr", "cmd", "powershell", "teams", "slack", "discord",
    "spotify", "steam", "obs", "jarvis", "tailscale", "nvda", "zoom",
}


class SecurityTools:

    @staticmethod
    async def check_breach(email: str) -> dict[str, Any]:
        """Check if email has been in a data breach via HaveIBeenPwned."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}",
                    headers={"hibp-api-key": "free", "User-Agent": "JARVIS-Security-Check"},
                    follow_redirects=True,
                )
                if r.status_code == 404:
                    return {"email": email, "breached": False, "message": "No breaches found. You're safe."}
                elif r.status_code == 200:
                    breaches = r.json()
                    names = [b.get("Name", "") for b in breaches[:5]]
                    return {
                        "email": email,
                        "breached": True,
                        "count": len(breaches),
                        "top_breaches": names,
                        "message": f"WARNING: Found in {len(breaches)} breach(es): {', '.join(names[:3])}"
                    }
                return {"error": f"API returned {r.status_code}"}
        except Exception as e:
            logger.error("Breach check failed: %s", e)
            return {"error": str(e)}

    @staticmethod
    async def audit_passwords(passwords: list[str]) -> dict[str, Any]:
        """Analyze password strength — checks length, complexity, common patterns."""
        results = []
        for pwd in passwords[:20]:
            score = 0
            issues = []
            if len(pwd) >= 12: score += 2
            elif len(pwd) >= 8: score += 1
            else: issues.append("Too short (< 8 chars)")
            if re.search(r'[A-Z]', pwd): score += 1
            else: issues.append("No uppercase")
            if re.search(r'[0-9]', pwd): score += 1
            else: issues.append("No numbers")
            if re.search(r'[!@#$%^&*]', pwd): score += 1
            else: issues.append("No special chars")
            common = ["password", "123456", "qwerty", "admin", "letmein", "welcome"]
            if any(c in pwd.lower() for c in common): issues.append("Contains common word")
            strength = ["Critical", "Weak", "Fair", "Good", "Strong", "Excellent"][min(score, 5)]
            results.append({"password": pwd[:3] + "***", "strength": strength, "score": score, "issues": issues})
        return {"results": results, "weak_count": sum(1 for r in results if r["score"] < 3)}

    @staticmethod
    async def audit_app_permissions() -> dict[str, Any]:
        """List processes with unusual network access."""
        suspicious = []
        all_procs = []
        try:
            connections = psutil.net_connections(kind="inet")
            pids_with_net = {c.pid for c in connections if c.raddr}
            for proc in psutil.process_iter(['pid', 'name', 'exe']):
                try:
                    name = proc.info['name'].lower().replace('.exe', '')
                    if proc.info['pid'] in pids_with_net:
                        is_known = name in KNOWN_SAFE
                        is_suspicious = any(re.search(p, name) for p in SUSPICIOUS_PROCESS_PATTERNS)
                        entry = {"name": name, "pid": proc.info['pid'], "known": is_known, "suspicious": is_suspicious}
                        all_procs.append(entry)
                        if is_suspicious or (not is_known and name not in ("", "idle")):
                            suspicious.append(entry)
                except Exception:
                    pass
        except Exception as e:
            return {"error": str(e)}
        return {
            "total_with_network": len(all_procs),
            "suspicious": suspicious[:10],
            "suspicious_count": len(suspicious),
        }

    @staticmethod
    async def check_vpn() -> dict[str, Any]:
        """Check if VPN/Tailscale is active."""
        try:
            result = subprocess.run(
                ["C:\\Program Files\\Tailscale\\tailscale.exe", "status"],
                capture_output=True, text=True, timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            connected = "alanbabu" in result.stdout or "Connected" in result.stdout
            return {"vpn": "tailscale", "connected": connected, "output": result.stdout[:200]}
        except Exception:
            return {"vpn": "tailscale", "connected": False, "error": "Tailscale not found"}

    @staticmethod
    async def scan_vulnerable_deps(project_path: str) -> dict[str, Any]:
        """Scan npm/pip packages for known vulnerabilities."""
        import os
        from pathlib import Path
        results = {"npm": [], "pip": [], "critical": 0}
        path = Path(project_path)
        if (path / "package.json").exists():
            try:
                r = subprocess.run(["npm", "audit", "--json"], cwd=str(path),
                    capture_output=True, text=True, timeout=30,
                    creationflags=subprocess.CREATE_NO_WINDOW)
                import json
                data = json.loads(r.stdout) if r.stdout else {}
                vulns = data.get("vulnerabilities", {})
                results["npm"] = [{"pkg": k, **v} for k, v in list(vulns.items())[:10]]
                results["critical"] += sum(1 for v in vulns.values() if v.get("severity") == "critical")
            except Exception as e:
                results["npm_error"] = str(e)
        return results
