from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    # "critical" | "warning" | "info" | "success"
    kind: Mapped[str] = mapped_column(String(16), nullable=False, server_default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # source identifier, e.g. "anomaly", "stock", "system"
    source: Mapped[str] = mapped_column(String(64), nullable=False, server_default="system")
    payload_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
