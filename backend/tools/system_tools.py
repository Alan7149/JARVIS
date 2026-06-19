import asyncio
import socket
from typing import Optional

import httpx
import psutil


class SystemTools:

    @staticmethod
    async def get_system_status() -> str:
        try:
            cpu = psutil.cpu_percent(interval=1)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage("/")
            uptime_seconds = asyncio.get_event_loop().time()

            battery_info = ""
            try:
                battery = psutil.sensors_battery()
                if battery:
                    charging = "charging" if battery.power_plugged else "on battery"
                    battery_info = f"\nBattery: {battery.percent:.0f}% ({charging})"
            except Exception:
                pass

            lines = [
                "System Status",
                "─────────────────────────",
                f"CPU Usage:    {cpu:.1f}%",
                f"RAM:          {mem.percent:.1f}% used ({mem.used / 1e9:.1f} GB / {mem.total / 1e9:.1f} GB)",
                f"Disk (/):     {disk.percent:.1f}% used ({disk.used / 1e9:.1f} GB / {disk.total / 1e9:.1f} GB)",
            ]
            if battery_info:
                lines.append(battery_info.strip())

            return "\n".join(lines)
        except Exception as e:
            return f"Error getting system status: {e}"

    @staticmethod
    async def get_disk_usage(path: Optional[str] = None) -> str:
        try:
            if path:
                partitions = [p for p in psutil.disk_partitions() if p.mountpoint == path]
                if not partitions:
                    usage = psutil.disk_usage(path)
                    return (
                        f"Path: {path}\n"
                        f"Total: {usage.total / 1e9:.2f} GB\n"
                        f"Used:  {usage.used / 1e9:.2f} GB ({usage.percent:.1f}%)\n"
                        f"Free:  {usage.free / 1e9:.2f} GB"
                    )
            else:
                partitions = psutil.disk_partitions()

            lines = ["Disk Usage", "─────────────────────────────────────────"]
            for part in partitions:
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    bar_filled = int(usage.percent / 5)
                    bar = "█" * bar_filled + "░" * (20 - bar_filled)
                    lines.append(
                        f"{part.mountpoint:20s} [{bar}] {usage.percent:5.1f}%  "
                        f"{usage.used/1e9:.1f}/{usage.total/1e9:.1f} GB"
                    )
                except PermissionError:
                    continue
            return "\n".join(lines)
        except Exception as e:
            return f"Error getting disk usage: {e}"

    @staticmethod
    async def get_running_processes(filter_name: Optional[str] = None, top_n: int = 20) -> str:
        try:
            procs = []
            for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "status"]):
                try:
                    info = proc.info
                    if filter_name and filter_name.lower() not in info["name"].lower():
                        continue
                    procs.append(info)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            procs.sort(key=lambda x: x.get("cpu_percent", 0) or 0, reverse=True)
            procs = procs[:top_n]

            if not procs:
                return f"No processes found{f' matching {filter_name}' if filter_name else ''}"

            lines = [f"{'PID':>8}  {'Name':<30}  {'CPU%':>6}  {'MEM%':>6}  Status"]
            lines.append("─" * 65)
            for p in procs:
                lines.append(
                    f"{p['pid']:>8}  {(p['name'] or '')[:30]:<30}  "
                    f"{(p['cpu_percent'] or 0):>6.1f}  {(p['memory_percent'] or 0):>6.1f}  {p['status']}"
                )
            return "\n".join(lines)
        except Exception as e:
            return f"Error getting processes: {e}"

    @staticmethod
    async def check_port(port: int) -> str:
        try:
            result_lines = [f"Port {port} Status", "─────────────────"]

            # Check if listening
            connections = psutil.net_connections(kind="inet")
            listeners = [c for c in connections if c.laddr.port == port]

            if not listeners:
                result_lines.append(f"Port {port} is NOT in use")
            else:
                for conn in listeners:
                    pid = conn.pid
                    proc_name = "unknown"
                    if pid:
                        try:
                            proc_name = psutil.Process(pid).name()
                        except Exception:
                            pass
                    result_lines.append(f"IN USE by PID {pid} ({proc_name}) — status: {conn.status}")

            return "\n".join(result_lines)
        except Exception as e:
            return f"Error checking port: {e}"

    @staticmethod
    async def check_url_health(url: str, timeout: int = 10) -> str:
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(url)
            status = response.status_code
            ok = "✓ Healthy" if 200 <= status < 400 else "✗ Unhealthy"
            return f"{ok}\nURL: {url}\nStatus: {status}\nResponse time: {response.elapsed.total_seconds():.2f}s"
        except httpx.ConnectError:
            return f"✗ Connection failed\nURL: {url}\nCould not connect to host"
        except httpx.TimeoutException:
            return f"✗ Timeout\nURL: {url}\nRequest timed out after {timeout}s"
        except Exception as e:
            return f"✗ Error checking URL: {e}"

    @staticmethod
    async def get_network_info() -> str:
        try:
            hostname = socket.gethostname()
            lines = [f"Hostname: {hostname}", "Network Interfaces", "─────────────────"]
            for iface, addrs in psutil.net_if_addrs().items():
                for addr in addrs:
                    if addr.family == socket.AF_INET:
                        lines.append(f"  {iface}: {addr.address}")
            net_io = psutil.net_io_counters()
            lines.append(
                f"\nNetwork I/O: Sent {net_io.bytes_sent/1e6:.1f} MB | Recv {net_io.bytes_recv/1e6:.1f} MB"
            )
            return "\n".join(lines)
        except Exception as e:
            return f"Error getting network info: {e}"
