"""Müşteri Sağlık Skoru (2C-7).

0-100 arası skor:
  - Sipariş sıklığı (son 90 gün)  — 0-40 puan
  - Sonuncu sipariş tarihi (recency) — 0-40 puan
  - Ödeme alışkanlığı (cari bakiye) — 0-20 puan
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Dict, List

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.sales import SalesRecord


@dataclass
class CustomerHealthScore:
    customer_id: int
    customer_name: str
    score: int           # 0-100
    tier: str            # "healthy" | "good" | "at_risk" | "critical"
    last_order_days: int | None   # days since last order (None = never)
    orders_90d: int
    balance: float       # current cari balance (+ = owes money)
    signals: list[str] = field(default_factory=list)


def _tier(score: int) -> str:
    if score >= 80:
        return "healthy"
    if score >= 60:
        return "good"
    if score >= 40:
        return "at_risk"
    return "critical"


def compute_customer_health(db: Session, *, tenant_id: int) -> List[CustomerHealthScore]:
    today = date.today()
    cutoff_90 = today - timedelta(days=90)
    cutoff_180 = today - timedelta(days=180)

    # All active customers for this tenant
    customers = db.scalars(
        select(Customer)
        .where(Customer.tenant_id == tenant_id)
        .where(Customer.deleted_at.is_(None))
    ).all()

    if not customers:
        return []

    customer_ids = [c.id for c in customers]

    # Orders per customer in last 90 days
    freq_rows = db.execute(
        select(
            SalesRecord.customer_id,
            func.count(SalesRecord.id).label("cnt"),
        )
        .where(SalesRecord.tenant_id == tenant_id)
        .where(SalesRecord.customer_id.in_(customer_ids))
        .where(SalesRecord.sale_date >= cutoff_90)
        .group_by(SalesRecord.customer_id)
    ).all()
    freq_map: Dict[int, int] = {r.customer_id: r.cnt for r in freq_rows}

    # Last order date per customer
    last_rows = db.execute(
        select(
            SalesRecord.customer_id,
            func.max(SalesRecord.sale_date).label("last_date"),
        )
        .where(SalesRecord.tenant_id == tenant_id)
        .where(SalesRecord.customer_id.in_(customer_ids))
        .group_by(SalesRecord.customer_id)
    ).all()
    last_map: Dict[int, date] = {r.customer_id: r.last_date for r in last_rows}

    # Current cari balances (debit - credit, per customer)
    try:
        balance_rows = db.execute(
            text(
                """
                SELECT customer_id,
                       SUM(CASE WHEN movement_type='debit' THEN amount ELSE -amount END) AS balance
                FROM account_movements
                WHERE tenant_id = :tid AND customer_id IS NOT NULL
                GROUP BY customer_id
                """
            ),
            {"tid": tenant_id},
        ).all()
        balance_map: Dict[int, float] = {r.customer_id: float(r.balance) for r in balance_rows}
    except Exception:
        balance_map = {}

    results: List[CustomerHealthScore] = []

    for c in customers:
        orders_90d = freq_map.get(c.id, 0)
        last_order_date = last_map.get(c.id)
        balance = balance_map.get(c.id, 0.0)

        # ── Recency score (0-40) ─────────────────────────────────────────────
        if last_order_date is None:
            recency_pts = 0
            last_order_days = None
        else:
            days_ago = (today - last_order_date).days
            last_order_days = days_ago
            if days_ago <= 30:
                recency_pts = 40
            elif days_ago <= 60:
                recency_pts = 30
            elif days_ago <= 90:
                recency_pts = 20
            elif days_ago <= 180:
                recency_pts = 10
            else:
                recency_pts = 0

        # ── Frequency score (0-40) ───────────────────────────────────────────
        if orders_90d >= 4:
            freq_pts = 40
        elif orders_90d == 3:
            freq_pts = 32
        elif orders_90d == 2:
            freq_pts = 22
        elif orders_90d == 1:
            freq_pts = 12
        else:
            # Check 90-180 window
            if last_order_date and last_order_date >= cutoff_180:
                freq_pts = 5
            else:
                freq_pts = 0

        # ── Payment score (0-20) ─────────────────────────────────────────────
        if balance <= 0:
            payment_pts = 20
        elif balance <= 1_000:
            payment_pts = 14
        elif balance <= 5_000:
            payment_pts = 7
        elif balance <= 20_000:
            payment_pts = 2
        else:
            payment_pts = 0

        score = recency_pts + freq_pts + payment_pts

        signals: list[str] = []
        if last_order_days is None or (last_order_days is not None and last_order_days > 60):
            signals.append("silent_60")
        if balance > 5_000:
            signals.append("payment_pending")
        if score >= 80 and orders_90d >= 3:
            signals.append("vip")

        results.append(
            CustomerHealthScore(
                customer_id=c.id,
                customer_name=c.name,
                score=score,
                tier=_tier(score),
                last_order_days=last_order_days,
                orders_90d=orders_90d,
                balance=balance,
                signals=signals,
            )
        )

    results.sort(key=lambda r: r.score)
    return results
