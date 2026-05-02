from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SalesForecastResult(Base):
    __tablename__ = "sales_forecast_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    model_name: Mapped[str] = mapped_column(String(128), index=True)
    scope: Mapped[str] = mapped_column(String(64), default="global", index=True)  # global|product|customer...

    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)
    forecast_start: Mapped[date] = mapped_column(Date, index=True)
    horizon_days: Mapped[int] = mapped_column()

    # Örnek çıktı: {"daily":[{"date":"2026-01-01","value":123.4}, ...], "meta": {...}}
    result_payload: Mapped[dict] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

