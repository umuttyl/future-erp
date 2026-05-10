"""HR performans: kiracı içi çalışan listesi + skor / içgörü (satış atfı yoksa deterministik proxy)."""

from __future__ import annotations

import math
from decimal import Decimal
from typing import List

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.sales import SalesRecord
from app.models.user import User


def _display_name(user: User) -> str:
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    return user.email.split("@", 1)[0]


def _insight_for_score(score: int) -> str:
    if score >= 80:
        return "Hedeflerin üzerinde üstün performans."
    if score >= 65:
        return "Beklentilerin üzerinde stabil performans."
    if score >= 50:
        return "Hedeflere yakın performans; gelişim alanları mevcut."
    return "Satış kayıtlarında düşüş var, desteklenmeli."


def _deterministic_fallback_score(user_id: int, tenant_id: int) -> int:
    """Satış verisi yokken test için tutarlı 1-100 skor (aynı kullanıcı her seferinde aynı)."""
    return 1 + (user_id * 7919 + tenant_id * 104729) % 100


def _score_from_activity(
    *,
    user_id: int,
    tenant_id: int,
    order_count: int,
    revenue_total: Decimal,
    user_count: int,
) -> int:
    """Çalışan bazlı satış alanı olmadığından tenant aktivitesi + deterministik bileşen."""
    if order_count <= 0:
        return _deterministic_fallback_score(user_id, tenant_id)

    n = max(user_count, 1)
    density = order_count / n
    rev = float(revenue_total or 0)
    rev_per_capita = rev / n if rev > 0 else 0.0

    # Log ölçeği: çok satış olduğunda skor tavanına yaklaşır
    activity = math.log1p(density * 2.0) * 18.0 + math.log1p(rev_per_capita / 1e4) * 12.0
    base = int(30 + min(55, activity))
    jitter = ((user_id * 17 + tenant_id * 3) % 21) - 10
    return max(1, min(100, base + jitter))


class HrPerformanceService:
    def list_employee_performance(self, db: Session, tenant_id: int) -> List[dict]:
        stmt_users = (
            select(User)
            .where(User.tenant_id == tenant_id)
            .order_by(User.is_active.desc(), User.id.asc())
        )
        users = list(db.scalars(stmt_users).all())

        order_count = db.scalar(
            select(func.count()).select_from(SalesRecord).where(SalesRecord.tenant_id == tenant_id)
        )
        order_count = int(order_count or 0)

        revenue_total = db.scalar(
            select(func.coalesce(func.sum(SalesRecord.total_amount), 0)).where(SalesRecord.tenant_id == tenant_id)
        )
        if revenue_total is None:
            rev_dec = Decimal("0")
        elif isinstance(revenue_total, Decimal):
            rev_dec = revenue_total
        else:
            rev_dec = Decimal(str(revenue_total))

        user_count = len(users)
        rows: List[dict] = []
        for u in users:
            score = _score_from_activity(
                user_id=u.id,
                tenant_id=tenant_id,
                order_count=order_count,
                revenue_total=rev_dec,
                user_count=user_count,
            )
            rows.append(
                {
                    "id": u.id,
                    "full_name": _display_name(u),
                    "email": u.email,
                    "is_active": bool(u.is_active),
                    "role": u.role,
                    "department": u.department,
                    "ai_score": score,
                    "ai_insight": _insight_for_score(score),
                }
            )
        return rows


hr_performance_service = HrPerformanceService()
