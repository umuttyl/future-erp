from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, NotFoundException
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerUpdate
from app.services._base import TenantScopedService


class CustomersService(TenantScopedService[Customer]):
    model = Customer
    def _base(self, db: Session, tenant_id: int):
        return select(Customer).where(
            Customer.tenant_id == tenant_id,
            Customer.deleted_at.is_(None),
        )

    def list(
        self,
        db: Session,
        *,
        tenant_id: int,
        search: Optional[str] = None,
        customer_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Customer]:
        stmt = self._base(db, tenant_id)
        if search:
            q = f"%{search.lower()}%"
            stmt = stmt.where(func.lower(Customer.name).like(q))
        if customer_type:
            stmt = stmt.where(Customer.customer_type == customer_type)
        stmt = stmt.order_by(Customer.name.asc()).offset(skip).limit(limit)
        return list(db.scalars(stmt).all())

    def get(self, db: Session, *, tenant_id: int, customer_id: int) -> Customer:
        stmt = self._base(db, tenant_id).where(Customer.id == customer_id)
        c = db.scalar(stmt)
        if not c:
            raise NotFoundException("Müşteri bulunamadı.", code="CUSTOMER_NOT_FOUND")
        return c

    def create(self, db: Session, *, tenant_id: int, data: CustomerCreate) -> Customer:
        existing = db.scalar(
            select(Customer).where(
                Customer.tenant_id == tenant_id,
                func.lower(Customer.name) == data.name.strip().lower(),
                Customer.deleted_at.is_(None),
            )
        )
        if existing:
            raise ConflictException("Bu isimde aktif bir müşteri zaten var.", code="CUSTOMER_EXISTS")
        c = Customer(
            tenant_id=tenant_id,
            name=data.name.strip(),
            email=str(data.email) if data.email else None,
            phone=data.phone,
            address=data.address,
            customer_type=data.customer_type,
            notes=data.notes,
        )
        db.add(c)
        db.commit()
        db.refresh(c)
        return c

    def update(self, db: Session, *, tenant_id: int, customer_id: int, data: CustomerUpdate) -> Customer:
        c = self.get(db, tenant_id=tenant_id, customer_id=customer_id)
        if data.name is not None:
            c.name = data.name.strip()
        if data.email is not None:
            c.email = str(data.email)
        if data.phone is not None:
            c.phone = data.phone
        if data.address is not None:
            c.address = data.address
        if data.customer_type is not None:
            c.customer_type = data.customer_type
        if data.notes is not None:
            c.notes = data.notes
        db.add(c)
        db.commit()
        db.refresh(c)
        return c

    def delete(self, db: Session, *, tenant_id: int, customer_id: int) -> None:
        c = self.get(db, tenant_id=tenant_id, customer_id=customer_id)
        c.deleted_at = datetime.now(timezone.utc)
        db.add(c)
        db.commit()


customers_service = CustomersService()
