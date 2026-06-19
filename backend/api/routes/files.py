import asyncio
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy import select

from core.config import settings
from core.database import get_db
from models.document_index import DocumentIndex

router = APIRouter()


@router.post("/index")
async def start_indexing(background_tasks: BackgroundTasks, path: str | None = None):
    paths = [path] if path else settings.INDEX_PATHS
    if not paths:
        return {"status": "error", "message": "No paths configured. Set INDEX_PATHS in .env"}
    background_tasks.add_task(_index_paths, paths)
    return {"status": "indexing_started", "paths": paths}


@router.get("/indexed")
async def list_indexed(limit: int = 100, db=Depends(get_db)):
    result = await db.execute(
        select(DocumentIndex).order_by(DocumentIndex.last_indexed_at.desc()).limit(limit)
    )
    docs = result.scalars().all()
    return [
        {
            "id": d.id,
            "file_name": d.file_name,
            "file_path": d.file_path,
            "file_type": d.file_type,
            "file_size_bytes": d.file_size_bytes,
            "last_indexed_at": d.last_indexed_at,
        }
        for d in docs
    ]


async def _index_paths(paths: list[str]):
    from core.database import AsyncSessionLocal

    SUPPORTED_EXTENSIONS = {
        ".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css",
        ".json", ".yaml", ".yml", ".toml", ".env", ".txt",
        ".md", ".rst", ".sql", ".sh", ".bat", ".ps1",
        ".csv", ".xml", ".ini", ".cfg",
    }

    async with AsyncSessionLocal() as db:
        for base_path in paths:
            for root, dirs, files in os.walk(base_path):
                dirs[:] = [d for d in dirs if d not in {
                    "__pycache__", ".git", "node_modules", ".venv", "venv",
                    "dist", "build", ".next", "migrations",
                }]
                for fname in files:
                    fpath = Path(root) / fname
                    if fpath.suffix.lower() not in SUPPORTED_EXTENSIONS:
                        continue
                    try:
                        stat = fpath.stat()
                        if stat.st_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
                            continue
                        with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                            content = f.read()
                        content_hash = hashlib.sha256(content.encode()).hexdigest()

                        result = await db.execute(
                            select(DocumentIndex).where(DocumentIndex.file_path == str(fpath))
                        )
                        existing = result.scalar_one_or_none()

                        if existing and existing.content_hash == content_hash:
                            continue

                        summary = content[:500].strip()
                        if existing:
                            existing.content_hash = content_hash
                            existing.raw_content = content[:10000]
                            existing.summary = summary
                            existing.last_indexed_at = datetime.now(timezone.utc)
                        else:
                            doc = DocumentIndex(
                                file_path=str(fpath),
                                file_name=fname,
                                file_type=fpath.suffix.lower().lstrip("."),
                                content_hash=content_hash,
                                raw_content=content[:10000],
                                summary=summary,
                                file_size_bytes=stat.st_size,
                                last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                                last_indexed_at=datetime.now(timezone.utc),
                            )
                            db.add(doc)
                        await db.commit()
                    except Exception:
                        continue
