import fnmatch
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Optional

from core.config import settings


class FileTools:

    @staticmethod
    async def read_file(path: str, lines: int = 500) -> str:
        try:
            p = Path(path)
            if not p.exists():
                return f"File not found: {path}"
            if not p.is_file():
                return f"Not a file: {path}"
            size_mb = p.stat().st_size / (1024 * 1024)
            if size_mb > settings.MAX_FILE_SIZE_MB:
                return f"File too large ({size_mb:.1f} MB). Max allowed: {settings.MAX_FILE_SIZE_MB} MB."
            with open(p, "r", encoding="utf-8", errors="replace") as f:
                content = f.readlines()
            if len(content) > lines:
                content = content[:lines]
                return "".join(content) + f"\n... (truncated at {lines} lines)"
            return "".join(content)
        except Exception as e:
            return f"Error reading file: {e}"

    @staticmethod
    async def list_directory(path: str, recursive: bool = False) -> str:
        try:
            p = Path(path)
            if not p.exists():
                return f"Directory not found: {path}"
            results = []
            if recursive:
                for item in sorted(p.rglob("*"))[:500]:
                    rel = item.relative_to(p)
                    prefix = "  " * (len(rel.parts) - 1)
                    suffix = "/" if item.is_dir() else ""
                    results.append(f"{prefix}{item.name}{suffix}")
            else:
                for item in sorted(p.iterdir()):
                    suffix = "/" if item.is_dir() else f"  ({item.stat().st_size:,} bytes)"
                    results.append(f"{item.name}{suffix}")
            return "\n".join(results) if results else "(empty directory)"
        except Exception as e:
            return f"Error listing directory: {e}"

    @staticmethod
    async def search_files(pattern: str, base_path: Optional[str] = None) -> str:
        try:
            search_roots = [Path(base_path)] if base_path else [Path(p) for p in settings.INDEX_PATHS]
            if not search_roots:
                search_roots = [Path.home()]
            matches = []
            for root in search_roots:
                if not root.exists():
                    continue
                for p in root.rglob("*"):
                    if fnmatch.fnmatch(p.name.lower(), pattern.lower()):
                        matches.append(str(p))
                    if len(matches) >= 100:
                        break
            if not matches:
                return f"No files found matching '{pattern}'"
            return "\n".join(matches[:100])
        except Exception as e:
            return f"Error searching files: {e}"

    @staticmethod
    async def search_code(query: str, path: Optional[str] = None, file_type: Optional[str] = None) -> str:
        try:
            import subprocess
            search_path = path or (settings.INDEX_PATHS[0] if settings.INDEX_PATHS else str(Path.home()))
            cmd = ["grep", "-rn", "--include", f"*.{file_type}" if file_type else "*", query, search_path]
            # Windows-compatible: use findstr if grep not available
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                output = result.stdout
            except FileNotFoundError:
                pattern = f"*.{file_type}" if file_type else None
                ext_filter = f"/m" if not pattern else ""
                findstr_cmd = ["findstr", "/s", "/n", query, os.path.join(search_path, f"*.{file_type}" if file_type else "*.*")]
                result = subprocess.run(findstr_cmd, capture_output=True, text=True, timeout=30)
                output = result.stdout

            lines = output.strip().split("\n")[:50]
            if not lines or not lines[0]:
                return f"No matches found for '{query}'"
            return "\n".join(lines)
        except Exception as e:
            return f"Error searching code: {e}"

    @staticmethod
    async def write_file(path: str, content: str, append: bool = False) -> str:
        try:
            p = Path(path)
            p.parent.mkdir(parents=True, exist_ok=True)
            mode = "a" if append else "w"
            with open(p, mode, encoding="utf-8") as f:
                f.write(content)
            return f"Successfully {'appended to' if append else 'wrote'} {path} ({len(content)} characters)"
        except Exception as e:
            return f"Error writing file: {e}"

    @staticmethod
    async def delete_file(path: str) -> str:
        try:
            p = Path(path)
            if not p.exists():
                return f"File not found: {path}"
            p.unlink()
            return f"Deleted: {path}"
        except Exception as e:
            return f"Error deleting file: {e}"

    @staticmethod
    async def read_logs(log_path: str, lines: int = 100, filter_text: Optional[str] = None) -> str:
        try:
            p = Path(log_path)
            if not p.exists():
                return f"Log file not found: {log_path}"
            with open(p, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
            if filter_text:
                all_lines = [l for l in all_lines if filter_text.lower() in l.lower()]
            tail = all_lines[-lines:]
            return "".join(tail) if tail else "(no matching log entries)"
        except Exception as e:
            return f"Error reading logs: {e}"

    @staticmethod
    async def search_documents(query: str, limit: int = 10) -> str:
        try:
            from sqlalchemy import select, or_
            from core.database import AsyncSessionLocal
            from models.document_index import DocumentIndex

            async with AsyncSessionLocal() as db:
                stmt = (
                    select(DocumentIndex)
                    .where(
                        or_(
                            DocumentIndex.file_name.ilike(f"%{query}%"),
                            DocumentIndex.summary.ilike(f"%{query}%"),
                            DocumentIndex.raw_content.ilike(f"%{query}%"),
                        )
                    )
                    .limit(limit)
                )
                result = await db.execute(stmt)
                docs = result.scalars().all()

            if not docs:
                return f"No documents found matching '{query}'"

            lines = []
            for doc in docs:
                lines.append(f"• {doc.file_name}")
                lines.append(f"  Path: {doc.file_path}")
                if doc.summary:
                    lines.append(f"  Summary: {doc.summary[:200]}")
                lines.append("")
            return "\n".join(lines)
        except Exception as e:
            return f"Error searching documents: {e}"
