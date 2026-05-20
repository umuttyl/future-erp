from __future__ import annotations

import json
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.core.module_config import SectorKey, get_default_modules

if TYPE_CHECKING:
    from app.models.user import User


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Sektör ve modül konfigürasyonu (onboarding sonrası doldurulur)
    sector: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, default=None)
    # active_modules JSON dizisi olarak saklanır: '["sales","inventory","finance"]'
    _active_modules: Mapped[Optional[str]] = mapped_column(
        "active_modules", Text, nullable=True, default=None
    )
    # Onboarding tamamlandı mı?
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False
    )

    users: Mapped[List["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")

    @property
    def active_modules(self) -> list[str]:
        """Aktif modül listesini döner. Onboarding yapılmamışsa sektöre göre varsayılan."""
        if self._active_modules:
            try:
                return json.loads(self._active_modules)
            except (json.JSONDecodeError, TypeError):
                pass
        if self.sector:
            return get_default_modules(self.sector)
        return get_default_modules(SectorKey.OTHER)

    @active_modules.setter
    def active_modules(self, modules: list[str]) -> None:
        """Aktif modül listesini JSON olarak kaydeder."""
        self._active_modules = json.dumps(modules)
