"""ENV=dev iken varsayılan kiracıda demo kullanıcıları oluşturur (yalnızca users tablosu boşsa).

``@futureerp.local`` adresleri Pydantic ``EmailStr`` / email-validator ile reddedilir (reserved TLD).
Bu yüzden demo adresleri ``@demo.example.com`` altında tutulur; eski ``.local`` satırları
açılışta otomatik düzeltilir.
"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User

logger = structlog.get_logger(__name__)

_LEGACY_SUFFIX = "@futureerp.local"
_CANON_SUFFIX = "@demo.example.com"


def _rewrite_legacy_demo_emails(db: Session) -> int:
    """Eski demo e-postalarını RFC uyumlu alan adına taşır."""
    n = 0
    stmt = select(User).where(User.email.like(f"%{_LEGACY_SUFFIX}"))
    for u in db.scalars(stmt):
        if u.email.endswith(_LEGACY_SUFFIX):
            u.email = u.email[: -len(_LEGACY_SUFFIX)].lower() + _CANON_SUFFIX
            n += 1
    return n


def ensure_dev_demo_users_if_empty() -> None:
    if settings.ENV.lower() != "dev":
        return
    from app.core.db import SessionLocal

    db: Session = SessionLocal()
    try:
        n_fix = _rewrite_legacy_demo_emails(db)
        if n_fix:
            logger.info("dev_demo_emails_rewritten", count=n_fix)

        tenant = db.scalar(select(Tenant).where(Tenant.slug == "default"))
        if tenant is None:
            db.commit()
            return
        if db.scalar(select(User.id).where(User.tenant_id == tenant.id).limit(1)):
            db.commit()
            return

        demos = [
            ("admin@demo.example.com", "Admin12345", "admin", "Demo Admin", "Yönetim"),
            ("manager@demo.example.com", "Manager12345", "manager", "Demo Manager", "Operasyon"),
            ("employee@demo.example.com", "Employee12345", "employee", "Demo Employee", "Satış"),
        ]
        for email, pw, role, full_name, department in demos:
            db.add(
                User(
                    tenant_id=tenant.id,
                    email=email,
                    password_hash=hash_password(pw),
                    full_name=full_name,
                    department=department,
                    role=role,
                    is_active=True,
                )
            )
        db.commit()
        logger.info("dev_demo_users_created", tenant_id=tenant.id)
    except Exception as exc:
        db.rollback()
        logger.warning("dev_demo_users_skipped", error_type=type(exc).__name__, message=str(exc)[:200])
    finally:
        db.close()
