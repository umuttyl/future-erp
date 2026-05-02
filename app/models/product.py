from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from typing import Optional

from sqlalchemy import DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reorder_level: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

