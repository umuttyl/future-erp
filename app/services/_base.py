"""Tenant-scoped service base class.

Multi-tenant izolasyonunu zorla: her sorgu otomatik tenant_id ile filtrelenir.
Servis sınıfları bu sınıfı extend etmeli; ham sorgular sadece bu sınıfın
_scoped veya _get_one helper'ları üzerinden gitmeli.
"""
from __future__ import annotations

from typing import Generic, Optional, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

M = TypeVar("M")


class TenantScopedService(Generic[M]):
    """Tenant'a özel tüm servisler için taban sınıf."""

    model: type[M]

    def _scoped(self, tenant_id: int):
        """tenant_id ile önceden filtrelenmiş SELECT döner."""
        return select(self.model).where(
            self.model.tenant_id == tenant_id  # type: ignore[attr-defined]
        )

    def _get_one(self, db: Session, tenant_id: int, pk: int) -> Optional[M]:
        stmt = self._scoped(tenant_id).where(
            self.model.id == pk  # type: ignore[attr-defined]
        )
        return db.scalar(stmt)
