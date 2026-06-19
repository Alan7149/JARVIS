from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class DocumentIndex(Base):
    __tablename__ = "document_index"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True, index=True)
    source_device: Mapped[str] = mapped_column(String(100), nullable=False, default="laptop")
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    permissions: Mapped[str] = mapped_column(String(50), nullable=False, default="private")
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=True)
    last_modified: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_indexed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
