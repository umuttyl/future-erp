from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import Notification


class NotificationService:
    def save(
        self,
        db: Session,
        *,
        tenant_id: int,
        kind: str,
        message: str,
        source: str = "system",
        payload: dict[str, Any] | None = None,
    ) -> Notification:
        n = Notification(
            tenant_id=tenant_id,
            kind=kind,
            message=message,
            source=source,
            payload_json=json.dumps(payload) if payload else None,
        )
        db.add(n)
        db.commit()
        db.refresh(n)
        return n

    def list_for_tenant(self, db: Session, *, tenant_id: int, limit: int = 60) -> list[Notification]:
        stmt = (
            select(Notification)
            .where(Notification.tenant_id == tenant_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt).all())

    def mark_read(self, db: Session, *, notification_id: int, tenant_id: int) -> bool:
        n = db.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.tenant_id == tenant_id,
            )
        )
        if not n:
            return False
        n.read_at = datetime.now(timezone.utc)
        db.add(n)
        db.commit()
        return True

    def mark_all_read(self, db: Session, *, tenant_id: int) -> int:
        rows = db.scalars(
            select(Notification).where(
                Notification.tenant_id == tenant_id,
                Notification.read_at.is_(None),
            )
        ).all()
        now = datetime.now(timezone.utc)
        for n in rows:
            n.read_at = now
            db.add(n)
        db.commit()
        return len(rows)

    def delete_read(self, db: Session, *, tenant_id: int) -> int:
        rows = db.scalars(
            select(Notification).where(
                Notification.tenant_id == tenant_id,
                Notification.read_at.isnot(None),
            )
        ).all()
        for n in rows:
            db.delete(n)
        db.commit()
        return len(rows)


notification_service = NotificationService()
