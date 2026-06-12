from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class StockCount(Base):
    __tablename__ = "stock_counts"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_stock_counts_tenant_id"),
        nullable=False,
        index=True,
    )
    count_no: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    count_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # draft | completed | cancelled
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", name="fk_stock_counts_created_by"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    items: Mapped[List["StockCountItem"]] = relationship(
        back_populates="stock_count", cascade="all, delete-orphan", passive_deletes=True
    )


class StockCountItem(Base):
    __tablename__ = "stock_count_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_stock_count_items_tenant_id"),
        nullable=False,
        index=True,
    )
    stock_count_id: Mapped[int] = mapped_column(
        ForeignKey("stock_counts.id", ondelete="CASCADE", name="fk_stock_count_items_count_id"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE", name="fk_stock_count_items_product_id"),
        nullable=False,
        index=True,
    )
    system_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    counted_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    # difference = counted_qty - system_qty (computed on complete)
    difference: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    stock_count: Mapped["StockCount"] = relationship(back_populates="items")
