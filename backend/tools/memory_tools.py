"""Persistent memory tools — JARVIS remembers facts about you."""
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("jarvis.tools.memory")


class MemoryTools:

    @staticmethod
    async def remember(key: str, value: str, category: str = "general") -> dict[str, Any]:
        """Store a fact in long-term memory."""
        from core.database import AsyncSessionLocal
        from models.memory import ConversationMemory
        from sqlalchemy import select

        try:
            async with AsyncSessionLocal() as db:
                now = datetime.now(timezone.utc)
                result = await db.execute(
                    select(ConversationMemory).where(ConversationMemory.key == key)
                )
                existing = result.scalar_one_or_none()
                if existing:
                    existing.value = value
                    existing.category = category
                    existing.updated_at = now
                else:
                    db.add(ConversationMemory(
                        key=key, value=value, category=category,
                        created_at=now, updated_at=now
                    ))
                await db.commit()
            return {"stored": True, "key": key, "value": value, "category": category}
        except Exception as e:
            logger.error("Memory store failed: %s", e)
            return {"error": str(e)}

    @staticmethod
    async def recall(key: str) -> dict[str, Any]:
        """Retrieve a specific memory by key."""
        from core.database import AsyncSessionLocal
        from models.memory import ConversationMemory
        from sqlalchemy import select

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ConversationMemory).where(ConversationMemory.key == key)
                )
                mem = result.scalar_one_or_none()
                if mem:
                    return {"found": True, "key": mem.key, "value": mem.value, "category": mem.category}
                return {"found": False, "key": key}
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    async def recall_all(category: str = None) -> dict[str, Any]:
        """Retrieve all memories, optionally filtered by category."""
        from core.database import AsyncSessionLocal
        from models.memory import ConversationMemory
        from sqlalchemy import select

        try:
            async with AsyncSessionLocal() as db:
                q = select(ConversationMemory)
                if category:
                    q = q.where(ConversationMemory.category == category)
                q = q.order_by(ConversationMemory.updated_at.desc())
                results = await db.execute(q)
                memories = results.scalars().all()
                return {
                    "memories": [
                        {"key": m.key, "value": m.value, "category": m.category,
                         "updated": m.updated_at.isoformat()}
                        for m in memories
                    ],
                    "count": len(memories),
                }
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    async def forget(key: str) -> dict[str, Any]:
        """Delete a memory by key."""
        from core.database import AsyncSessionLocal
        from models.memory import ConversationMemory
        from sqlalchemy import select

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ConversationMemory).where(ConversationMemory.key == key)
                )
                mem = result.scalar_one_or_none()
                if mem:
                    await db.delete(mem)
                    await db.commit()
                    return {"deleted": True, "key": key}
                return {"deleted": False, "key": key, "reason": "Not found"}
        except Exception as e:
            return {"error": str(e)}
