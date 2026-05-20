"""P1-4: Admin impersonation audit log tests."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.tenant import Tenant


def _make_tenant(db: Session, name: str, slug: str) -> Tenant:
    t = Tenant(name=name, slug=slug)
    db.add(t)
    db.flush()
    return t


def test_impersonation_is_logged(client, db_session: Session, test_tenant, test_admin):
    """Admin X-Impersonate-Tenant-Id başlığı ile istekte bulununca audit log yazılmalı."""
    target = _make_tenant(db_session, "Target Co", "target-co-audit")

    resp = client.get(
        "/api/auth/me",
        headers={"X-Impersonate-Tenant-Id": str(target.id)},
    )
    assert resp.status_code == 200

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "admin.impersonate_tenant")
    ).all()
    assert len(logs) >= 1
    log = logs[-1]
    assert log.actor_user_id == test_admin.id
    assert log.actor_tenant_id == test_tenant.id
    assert log.target_tenant_id == target.id
    assert log.payload is not None
    assert "path" in log.payload


def test_impersonation_same_tenant_not_logged(client, db_session: Session, test_tenant):
    """Admin kendi tenant_id'sini gönderince log yazılmamalı."""
    resp = client.get(
        "/api/auth/me",
        headers={"X-Impersonate-Tenant-Id": str(test_tenant.id)},
    )
    assert resp.status_code == 200

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "admin.impersonate_tenant")
    ).all()
    assert len(logs) == 0


def test_no_impersonation_header_no_log(client, db_session: Session):
    """Header yoksa log yazılmamalı."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "admin.impersonate_tenant")
    ).all()
    assert len(logs) == 0


def test_impersonation_invalid_header_ignored(client, db_session: Session):
    """Geçersiz header (sayı olmayan) hata vermemeli, log da yazılmamalı."""
    resp = client.get(
        "/api/auth/me",
        headers={"X-Impersonate-Tenant-Id": "not-a-number"},
    )
    assert resp.status_code == 200

    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.action == "admin.impersonate_tenant")
    ).all()
    assert len(logs) == 0
