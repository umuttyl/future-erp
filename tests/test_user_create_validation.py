"""A: Staff oluştururken/güncellenirken job_role zorunluluğu (izinsiz kullanıcı önlenir)."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationException
from app.models.tenant import Tenant
from app.schemas.auth import AdminUserCreateIn, UserUpdateIn
from app.services.auth_service import auth_service
from app.services.job_role_seed import seed_system_roles


def _kasiyer_id(db: Session, tenant_id: int) -> int:
    roles = seed_system_roles(db, tenant_id)
    return next(r.id for r in roles if r.name == "Kasiyer")


def test_create_staff_without_job_role_rejected(db_session: Session, test_tenant: Tenant):
    data = AdminUserCreateIn(
        email="nostaffrole@test.com",
        password="Secret123",
        role="employee",
        role_kind="staff",
        job_role_id=None,
    )
    with pytest.raises(ValidationException):
        auth_service.create_user_admin(db_session, tenant_id=test_tenant.id, data=data)


def test_create_staff_with_foreign_job_role_rejected(db_session: Session, test_tenant: Tenant):
    """Başka tenant'ın rol şablonu kabul edilmemeli."""
    other = Tenant(name="Other", slug="other-co")
    db_session.add(other)
    db_session.flush()
    foreign_role_id = _kasiyer_id(db_session, other.id)

    data = AdminUserCreateIn(
        email="foreignrole@test.com",
        password="Secret123",
        role="employee",
        role_kind="staff",
        job_role_id=foreign_role_id,
    )
    with pytest.raises(ValidationException):
        auth_service.create_user_admin(db_session, tenant_id=test_tenant.id, data=data)


def test_create_staff_with_valid_job_role_ok(db_session: Session, test_tenant: Tenant):
    role_id = _kasiyer_id(db_session, test_tenant.id)
    data = AdminUserCreateIn(
        email="goodstaff@test.com",
        password="Secret123",
        role="employee",
        role_kind="staff",
        job_role_id=role_id,
    )
    u = auth_service.create_user_admin(db_session, tenant_id=test_tenant.id, data=data)
    assert u.job_role_id == role_id
    assert u.role_kind == "staff"


def test_create_owner_without_job_role_ok(db_session: Session, test_tenant: Tenant):
    """Owner için job_role gerekmez."""
    data = AdminUserCreateIn(
        email="owner2@test.com",
        password="Secret123",
        role="manager",
        role_kind="owner",
        job_role_id=None,
    )
    u = auth_service.create_user_admin(db_session, tenant_id=test_tenant.id, data=data)
    assert u.role_kind == "owner"
    assert u.job_role_id is None


def test_update_to_staff_without_job_role_rejected(db_session: Session, test_tenant: Tenant, test_employee):
    """Owner → staff'a çevirirken job_role yoksa reddedilmeli."""
    upd = UserUpdateIn(role_kind="staff", job_role_id=None)
    with pytest.raises(ValidationException):
        auth_service.update_user(
            db_session, tenant_id=test_tenant.id, user_id=test_employee.id, data=upd
        )
