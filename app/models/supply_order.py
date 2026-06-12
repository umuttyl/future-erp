from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.supplier import Supplier


class SupplyOrder(Base):
    """Tedarik / yeniden sipariş taslağı (Actionable AI çıktısı)."""

    __tablename__ = "supply_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    supplier_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    # Birim alış fiyatı — None ise teslim alımda product.cost_price kullanılır
    unit_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Draft", server_default="Draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    supplier: Mapped[Optional["Supplier"]] = relationship("Supplier", foreign_keys=[supplier_id], lazy="select")
