from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, date
from typing import Literal
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from app.models.sales import SalesRecord
from app.models.account_movement import AccountMovement
from app.models.record_comment import RecordComment

EventKind = Literal["sale", "payment", "credit", "comment"]


@dataclass
class TimelineEvent:
    kind: EventKind
    timestamp: datetime      # normalised to datetime for sorting
    title: str
    subtitle: str | None
    amount: float | None


def _to_dt(d: date | datetime) -> datetime:
    if isinstance(d, datetime):
        return d
    return datetime(d.year, d.month, d.day)


def get_customer_timeline(
    db: Session,
    *,
    tenant_id: int,
    customer_id: int,
    limit: int = 30,
) -> list[TimelineEvent]:
    events: list[TimelineEvent] = []

    # ── Sales ─────────────────────────────────────────────────────────────
    sales = db.execute(
        select(SalesRecord)
        .where(
            SalesRecord.tenant_id == tenant_id,
            SalesRecord.customer_id == customer_id,
        )
        .order_by(desc(SalesRecord.sale_date))
        .limit(limit)
    ).scalars().all()

    for s in sales:
        events.append(TimelineEvent(
            kind="sale",
            timestamp=_to_dt(s.sale_date),
            title="Sale recorded",
            subtitle=f"#{s.id} — {float(s.total_amount):,.2f} ₺",
            amount=float(s.total_amount),
        ))

    # ── Account Movements ─────────────────────────────────────────────────
    movements = db.execute(
        select(AccountMovement)
        .where(
            AccountMovement.tenant_id == tenant_id,
            AccountMovement.customer_id == customer_id,
        )
        .order_by(desc(AccountMovement.movement_date))
        .limit(limit)
    ).scalars().all()

    KIND_MAP = {
        "payment": ("payment", "Payment received"),
        "credit":  ("credit",  "Credit note / refund"),
        "debit":   ("sale",    "Debit entry"),
    }

    for m in movements:
        kind_key, title = KIND_MAP.get(m.movement_type, ("payment", m.movement_type))
        events.append(TimelineEvent(
            kind=kind_key,  # type: ignore[arg-type]
            timestamp=_to_dt(m.movement_date),
            title=title,
            subtitle=m.description or None,
            amount=float(m.amount),
        ))

    # ── Comments ──────────────────────────────────────────────────────────
    comments = db.execute(
        select(RecordComment)
        .where(
            RecordComment.tenant_id == tenant_id,
            RecordComment.entity_type == "customer",
            RecordComment.entity_id == customer_id,
        )
        .order_by(desc(RecordComment.created_at))
        .limit(limit)
    ).scalars().all()

    for c in comments:
        events.append(TimelineEvent(
            kind="comment",
            timestamp=c.created_at,
            title=f"Comment — {c.author_name}",
            subtitle=c.body[:120] + ("…" if len(c.body) > 120 else ""),
            amount=None,
        ))

    # Sort all events newest-first, keep top N
    events.sort(key=lambda e: e.timestamp, reverse=True)
    return events[:limit]
