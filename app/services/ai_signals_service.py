"""AI signal computation for inline badges on customer and product lists."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account_movement import AccountMovement
from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord


CustomerSignal = Literal["vip", "silent_30", "payment_pending"]
ProductSignal  = Literal["critical", "declining", "fast_mover"]


@dataclass
class CustomerSignals:
    customer_id: int
    signals: list[CustomerSignal] = field(default_factory=list)


@dataclass
class ProductSignals:
    product_id: int
    signals: list[ProductSignal] = field(default_factory=list)


# ─── Customer signals ─────────────────────────────────────────────────────────

def compute_customer_signals(db: Session, *, tenant_id: int) -> list[CustomerSignals]:
    today = date.today()
    cutoff_silent = today - timedelta(days=30)
    cutoff_vip    = today - timedelta(days=90)

    # Revenue per customer in last 90 days
    revenue_rows = db.execute(
        select(
            SalesRecord.customer_id,
            func.sum(SalesRecord.total_amount).label("total"),
        )
        .where(
            SalesRecord.tenant_id == tenant_id,
            SalesRecord.customer_id.is_not(None),
            SalesRecord.sale_date >= cutoff_vip,
        )
        .group_by(SalesRecord.customer_id)
    ).all()

    revenue_map: dict[int, float] = {r.customer_id: float(r.total) for r in revenue_rows}

    # VIP threshold — top 20%
    if revenue_map:
        sorted_rev = sorted(revenue_map.values(), reverse=True)
        top20_idx  = max(0, int(len(sorted_rev) * 0.2) - 1)
        vip_threshold = sorted_rev[top20_idx]
    else:
        vip_threshold = float("inf")

    # Latest sale date per customer (last 30-day check)
    latest_rows = db.execute(
        select(
            SalesRecord.customer_id,
            func.max(SalesRecord.sale_date).label("last_sale"),
        )
        .where(
            SalesRecord.tenant_id == tenant_id,
            SalesRecord.customer_id.is_not(None),
        )
        .group_by(SalesRecord.customer_id)
    ).all()

    last_sale_map: dict[int, date] = {}
    for r in latest_rows:
        try:
            last_sale_map[r.customer_id] = (
                r.last_sale if isinstance(r.last_sale, date) else date.fromisoformat(str(r.last_sale))
            )
        except (TypeError, ValueError):
            pass

    # Account balances: positive balance = customer owes money
    balance_rows = db.execute(
        select(
            AccountMovement.customer_id,
            func.sum(AccountMovement.amount).label("balance"),
        )
        .where(AccountMovement.tenant_id == tenant_id)
        .group_by(AccountMovement.customer_id)
    ).all()

    balance_map: dict[int, float] = {r.customer_id: float(r.balance) for r in balance_rows}

    # All customer IDs that appear in any of the maps
    all_ids = set(revenue_map) | set(last_sale_map) | set(balance_map)

    results: list[CustomerSignals] = []
    for cid in all_ids:
        sigs: list[CustomerSignal] = []
        rev = revenue_map.get(cid, 0.0)

        if revenue_map and rev >= vip_threshold and rev > 0:
            sigs.append("vip")

        last_sale = last_sale_map.get(cid)
        if last_sale and last_sale < cutoff_silent:
            sigs.append("silent_30")

        bal = balance_map.get(cid, 0.0)
        if bal > 0:
            sigs.append("payment_pending")

        if sigs:
            results.append(CustomerSignals(customer_id=cid, signals=sigs))

    return results


# ─── Product signals ──────────────────────────────────────────────────────────

def compute_product_signals(db: Session, *, tenant_id: int) -> list[ProductSignals]:
    today = date.today()
    cutoff_velocity = today - timedelta(days=30)

    # Quantity sold per product in last 30 days
    sold_rows = db.execute(
        select(
            SalesItem.product_id,
            func.sum(SalesItem.quantity).label("qty_sold"),
        )
        .join(SalesRecord, SalesRecord.id == SalesItem.sales_record_id)
        .where(
            SalesItem.tenant_id == tenant_id,
            SalesRecord.sale_date >= cutoff_velocity,
        )
        .group_by(SalesItem.product_id)
    ).all()

    sold_map: dict[int, float] = {r.product_id: float(r.qty_sold) for r in sold_rows}

    # Fast mover threshold — top 25%
    if sold_map:
        sorted_qty = sorted(sold_map.values(), reverse=True)
        top25_idx  = max(0, int(len(sorted_qty) * 0.25) - 1)
        fast_threshold = sorted_qty[top25_idx]
    else:
        fast_threshold = float("inf")

    products = db.scalars(
        select(Product).where(Product.tenant_id == tenant_id)
    ).all()

    results: list[ProductSignals] = []
    for p in products:
        sigs: list[ProductSignal] = []
        sq = int(p.stock_quantity or 0)
        rl = int(p.reorder_level or 0)

        if rl > 0 and sq <= rl:
            sigs.append("critical")
        elif rl > 0 and sq <= rl * 1.5:
            sigs.append("declining")

        qty_sold = sold_map.get(p.id, 0.0)
        if sold_map and qty_sold >= fast_threshold and qty_sold > 0:
            sigs.append("fast_mover")

        if sigs:
            results.append(ProductSignals(product_id=p.id, signals=sigs))

    return results
