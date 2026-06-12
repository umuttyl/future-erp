from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AccountMovement(Base):
    __tablename__ = "account_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_account_movements_tenant_id"),
        index=True,
        nullable=False,
    )
    customer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL", name="fk_account_movements_customer_id"),
        nullable=True,
        index=True,
    )
    # 'debit' = borç (müşteri bize borçlandı), 'payment' = tahsilat (ödedi)
    # 'credit' = alacak notu / iade
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    sales_record_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sales_records.id", ondelete="SET NULL", name="fk_account_movements_sales_record_id"),
        nullable=True,
        index=True,
    )
    movement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    customer: Mapped[Optional["Customer"]] = relationship(  # noqa: F821
        "Customer", foreign_keys=[customer_id], lazy="select"
    )
