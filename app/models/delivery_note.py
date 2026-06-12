from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from decimal import Decimal


class DeliveryNote(Base):
    __tablename__ = "delivery_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_delivery_notes_tenant_id"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE", name="fk_delivery_notes_order_id"),
        nullable=False,
        index=True,
    )
    delivery_no: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    delivery_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # draft | sent | cancelled
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", name="fk_delivery_notes_created_by"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped["CustomerOrder"] = relationship(  # noqa: F821
        "CustomerOrder", back_populates="delivery_notes"
    )
    items: Mapped[List["DeliveryNoteItem"]] = relationship(
        back_populates="delivery_note", cascade="all, delete-orphan", passive_deletes=True
    )


class DeliveryNoteItem(Base):
    __tablename__ = "delivery_note_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_delivery_note_items_tenant_id"),
        nullable=False,
        index=True,
    )
    delivery_note_id: Mapped[int] = mapped_column(
        ForeignKey("delivery_notes.id", ondelete="CASCADE", name="fk_delivery_note_items_dn_id"),
        nullable=False,
        index=True,
    )
    order_item_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customer_order_items.id", ondelete="SET NULL", name="fk_delivery_note_items_order_item_id"),
        nullable=True,
        index=True,
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE", name="fk_delivery_note_items_product_id"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    delivery_note: Mapped["DeliveryNote"] = relationship(back_populates="items")
