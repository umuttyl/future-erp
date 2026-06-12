from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_invoices_tenant_id"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE", name="fk_invoices_order_id"),
        nullable=False,
        index=True,
    )
    delivery_note_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("delivery_notes.id", ondelete="SET NULL", name="fk_invoices_delivery_note_id"),
        nullable=True,
        index=True,
    )
    invoice_no: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    customer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL", name="fk_invoices_customer_id"),
        nullable=True,
        index=True,
    )
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    tax_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    # draft | sent | paid | cancelled
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", name="fk_invoices_created_by"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    order: Mapped["CustomerOrder"] = relationship(  # noqa: F821
        "CustomerOrder", back_populates="invoices"
    )
