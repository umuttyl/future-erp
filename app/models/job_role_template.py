from __future__ import annotations

from datetime import datetime
from typing import List

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class JobRoleTemplate(Base):
    """Tenant-scoped role template with a JSON permission list."""

    __tablename__ = "job_role_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    #: List[str] stored as JSON — e.g. ["sales.write", "customers.read"]
    permissions: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    #: System roles are seeded on tenant creation and cannot be deleted.
    is_system: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
