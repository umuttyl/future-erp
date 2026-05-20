from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, NotFoundException
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.services._base import TenantScopedService


class SuppliersService(TenantScopedService[Supplier]):
    model = Supplier
    def _base(self, db: Session, tenant_id: int):
        return select(Supplier).where(
            Supplier.tenant_id == tenant_id,
            Supplier.deleted_at.is_(None),
        )

    def list(
        self,
        db: Session,
        *,
        tenant_id: int,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Supplier]:
        stmt = self._base(db, tenant_id)
        if search:
            q = f"%{search.lower()}%"
            stmt = stmt.where(func.lower(Supplier.name).like(q))
        stmt = stmt.order_by(Supplier.name.asc()).offset(skip).limit(limit)
        return list(db.scalars(stmt).all())

    def get(self, db: Session, *, tenant_id: int, supplier_id: int) -> Supplier:
        stmt = self._base(db, tenant_id).where(Supplier.id == supplier_id)
        s = db.scalar(stmt)
        if not s:
            raise NotFoundException("Tedarikçi bulunamadı.", code="SUPPLIER_NOT_FOUND")
        return s

    def create(self, db: Session, *, tenant_id: int, data: SupplierCreate) -> Supplier:
        existing = db.scalar(
            select(Supplier).where(
                Supplier.tenant_id == tenant_id,
                func.lower(Supplier.name) == data.name.strip().lower(),
                Supplier.deleted_at.is_(None),
            )
        )
        if existing:
            raise ConflictException("Bu isimde aktif bir tedarikçi zaten var.", code="SUPPLIER_EXISTS")
        s = Supplier(
            tenant_id=tenant_id,
            name=data.name.strip(),
            contact_person=data.contact_person,
            email=str(data.email) if data.email else None,
            phone=data.phone,
            payment_terms=data.payment_terms,
            notes=data.notes,
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        return s

    def update(self, db: Session, *, tenant_id: int, supplier_id: int, data: SupplierUpdate) -> Supplier:
        s = self.get(db, tenant_id=tenant_id, supplier_id=supplier_id)
        if data.name is not None:
            s.name = data.name.strip()
        if data.contact_person is not None:
            s.contact_person = data.contact_person
        if data.email is not None:
            s.email = str(data.email)
        if data.phone is not None:
            s.phone = data.phone
        if data.payment_terms is not None:
            s.payment_terms = data.payment_terms
        if data.notes is not None:
            s.notes = data.notes
        db.add(s)
        db.commit()
        db.refresh(s)
        return s

    def delete(self, db: Session, *, tenant_id: int, supplier_id: int) -> None:
        s = self.get(db, tenant_id=tenant_id, supplier_id=supplier_id)
        s.deleted_at = datetime.now(timezone.utc)
        db.add(s)
        db.commit()


suppliers_service = SuppliersService()
