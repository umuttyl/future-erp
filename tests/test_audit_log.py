"""P1-4 + ADM-10: Platform admin impersonation audit log.

Yeni model (ADM-10):
- Impersonation YALNIZCA platform admin için geçerli (is_platform_admin=True).
- `get_tenant` üzerinden tetiklenir → tenant-scoped endpoint'lerde (örn. /api/products).
- Platform admin impersonation header'ı OLMADAN tenant endpoint'ine erişemez (403).
- AuditLog.actor_tenant_id = None (platform admin'in tenant'ı yoktur).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.tenant import Tenant


def _make_tenant(db: Session, name: str, slug: str) -> Tenant:
    t = Tenant(name=name, slug=slug)
    db.add(t)
    db.flush()
    return t


def test_impersonation_is_logged(client_platform_admin, db_session: Session, test_platform_admin):
    """Platform admin X-Impersonate-Tenant-Id ile tenant endpoint'ine erişince log yazılmalı."""
    target = _make_tenant(db_session, "Target Co", "target-co-audit")

    resp = client_platform_admin.get(
        "/api/products",
        headers={"X-Impersonate-Tenant-Id": str(target.id)},
    )
    assert resp.status_code == 200

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "admin.impersonate_tenant")
    ).all()
    assert len(logs) >= 1
    log = logs[-1]
    assert log.actor_user_id == test_platform_admin.id
    assert log.actor_tenant_id is None          # platform admin'in tenant'ı yok
    assert log.target_tenant_id == target.id
    assert log.payload is not None
    assert "path" in log.payload


def test_platform_admin_without_header_forbidden(client_platform_admin, db_session: Session):
    """Platform admin impersonation header'ı olmadan tenant endpoint'ine erişemez (403)."""
    resp = client_platform_admin.get("/api/products")
    assert resp.status_code == 403

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "admin.impersonate_tenant")
    ).all()
    assert len(logs) == 0


def test_platform_admin_invalid_header_forbidden(client_platform_admin, db_session: Session):
    """Geçersiz (sayı olmayan) header → impersonation olmaz → 403, log yazılmaz."""
    resp = client_platform_admin.get(
        "/api/products",
        headers={"X-Impersonate-Tenant-Id": "not-a-number"},
    )
    assert resp.status_code == 403

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "admin.impersonate_tenant")
    ).all()
    assert len(logs) == 0


def test_owner_impersonation_header_ignored(client, db_session: Session):
    """Tenant owner için impersonation header yok sayılır — kendi tenant'ına erişir, log yazılmaz."""
    resp = client.get(
        "/api/products",
        headers={"X-Impersonate-Tenant-Id": "999"},
    )
    assert resp.status_code == 200

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "admin.impersonate_tenant")
    ).all()
    assert len(logs) == 0
