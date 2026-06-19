from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    parameters: Mapped[dict] = mapped_column(JSON, nullable=True)
    result: Mapped[str] = mapped_column(Text, nullable=True)
    device: Mapped[str] = mapped_column(String(100), nullable=False, default="laptop")
    requester: Mapped[str] = mapped_column(String(100), nullable=False, default="user")
    approval_status: Mapped[str] = mapped_column(String(50), nullable=False, default="auto")
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
