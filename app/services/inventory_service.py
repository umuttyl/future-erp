"""Stok / tedarik tarafı iş kuralları (Actionable AI taslakları)."""

from __future__ import annotations

import math
import random
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.sales_forecast_result import SalesForecastResult
from app.models.supply_order import SupplyOrder

# Ürün reorder_level yoksa veya 0 ise kullanılan varsayılan kritik üst sınır (stok bu değerin altında/ eşiğinde tetiklenir).
DEFAULT_CRITICAL_STOCK_THRESHOLD = 50
# Basit hedef stok; önerilen sipariş tabanı: max(0, TARGET_STOCK - mevcut_stok).
DEFAULT_TARGET_STOCK = 100
_PROPHET_MODEL = "prophet"
_FORECAST_SUM_DAYS = 30


def _effective_critical_threshold(product: Product) -> int:
    if product.reorder_level and product.reorder_level > 0:
        return int(product.reorder_level)
    return DEFAULT_CRITICAL_STOCK_THRESHOLD


def _is_stock_critically_low(product: Product) -> bool:
    return int(product.stock_quantity or 0) <= _effective_critical_threshold(product)


def pick_random_product_for_ws_notification(db: Session, tenant_id: int) -> tuple[int, str] | None:
    """Rastgele (id, sku). Mümkünse kritik stoktaki ürün seçilir; auto-draft demosu için."""
    pool = list_ws_anomaly_candidate_products(db, tenant_id)
    if not pool:
        return None
    return random.choice(pool)


def list_ws_anomaly_candidate_products(db: Session, tenant_id: int) -> list[tuple[int, str]]:
    """WS anomali simülasyonu: kritik stoktakiler önce, sonra diğer ürünler (tenant kapsamlı)."""
    rows = list(db.scalars(select(Product).where(Product.tenant_id == tenant_id)).all())
    if not rows:
        return []
    critical_ids = {p.id for p in rows if _is_stock_critically_low(p)}
    critical = [(int(p.id), str(p.sku)) for p in rows if p.id in critical_ids]
    rest = [(int(p.id), str(p.sku)) for p in rows if p.id not in critical_ids]
    return critical + rest


def _sum_prophet_daily_demand(payload: dict[str, Any], max_days: int) -> Optional[int]:
    daily = payload.get("daily")
    if not isinstance(daily, list) or not daily:
        return None
    total = 0.0
    for row in daily[:max_days]:
        if not isinstance(row, dict):
            continue
        v = row.get("quantity")
        if v is None:
            v = row.get("value")
        if v is None:
            v = row.get("yhat")
        if v is None:
            continue
        try:
            total += float(v)
        except (TypeError, ValueError):
            continue
    return max(0, int(math.ceil(total)))


def _latest_product_prophet_demand(db: Session, tenant_id: int, product_id: int) -> Optional[int]:
    stmt = (
        select(SalesForecastResult)
        .where(
            SalesForecastResult.tenant_id == tenant_id,
            SalesForecastResult.product_id == product_id,
            SalesForecastResult.model_name == _PROPHET_MODEL,
        )
        .order_by(SalesForecastResult.id.desc())
        .limit(1)
    )
    row = db.scalar(stmt)
    if row is None or not row.result_payload:
        return None
    return _sum_prophet_daily_demand(row.result_payload, _FORECAST_SUM_DAYS)


class InventoryService:
    def get_product(self, db: Session, tenant_id: int, product_id: int) -> Optional[Product]:
        stmt = select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id)
        return db.scalar(stmt)

    def auto_draft_supply_order(
        self,
        db: Session,
        tenant_id: int,
        product_id: int,
        *,
        is_ai_override: bool = False,
    ) -> tuple[SupplyOrder, dict[str, Any]]:
        product = self.get_product(db, tenant_id, product_id)
        if product is None:
            raise ValueError("PRODUCT_NOT_FOUND")

        threshold = _effective_critical_threshold(product)
        stock = int(product.stock_quantity or 0)

        if not is_ai_override and not _is_stock_critically_low(product):
            raise ValueError("STOCK_NOT_CRITICAL")

        target_gap = max(0, DEFAULT_TARGET_STOCK - stock)
        prophet_sum = _latest_product_prophet_demand(db, tenant_id, product_id)
        forecast_gap = max(0, prophet_sum - stock) if prophet_sum is not None else 0

        if prophet_sum is not None:
            quantity = max(target_gap, forecast_gap, 1)
        else:
            quantity = max(target_gap, 1)

        # AI bildiriminden gelen proaktif taslak: mevcut stok hedefin üstündeyse bile anlamlı miktar.
        if is_ai_override:
            quantity = max(quantity, 50)

        order = SupplyOrder(
            tenant_id=tenant_id,
            product_id=product.id,
            quantity=quantity,
            status="Draft",
        )
        db.add(order)
        db.commit()
        db.refresh(order)

        meta = {
            "stock_before": stock,
            "critical_threshold_used": threshold,
            "target_stock": DEFAULT_TARGET_STOCK,
            "quantity_from_target_gap": target_gap,
            "prophet_demand_sum_30d": prophet_sum,
            "is_ai_override": is_ai_override,
        }
        return order, meta


inventory_service = InventoryService()
