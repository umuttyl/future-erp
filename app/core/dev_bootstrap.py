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

        # Platform admin — tenant_id=NULL, is_platform_admin=True
        admin_exists = db.scalar(
            select(User.id).where(User.is_platform_admin.is_(True)).limit(1)
        )
        if not admin_exists:
            db.add(User(
                tenant_id=None,
                email="admin@demo.example.com",
                password_hash=hash_password("Admin12345"),
                full_name="Demo Admin",
                department=None,
                is_platform_admin=True,
                role_kind="owner",
                is_active=True,
            ))
            db.commit()
            logger.info("dev_platform_admin_created")
    except Exception as exc:
        db.rollback()
        logger.warning("dev_demo_users_skipped", error_type=type(exc).__name__, message=str(exc)[:200])
    finally:
        db.close()
