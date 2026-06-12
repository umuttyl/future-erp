"""Tests for user_permissions() — role_kind-aware permission resolution (2A-4)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.permissions import ALL_PERMISSIONS, user_permissions
from app.core.security import hash_password
from app.models.user import User
from app.services.job_role_seed import seed_system_roles


def _make_user(db: Session, tenant, **kwargs) -> User:
    kwargs.pop("role", None)  # eski 'role' kwarg'ı yok sayılır (artık türetilmiş)
    u = User(
        tenant_id=tenant.id,
        email=kwargs.pop("email", "u@test.com"),
        password_hash=hash_password("Pw1!"),
        **kwargs,
    )
    db.add(u)
    db.flush()
    db.refresh(u)
    return u


class TestUserPermissionsOwner:
    def test_owner_gets_all_permissions(self, db_session: Session, test_tenant):
        u = _make_user(db_session, test_tenant, email="owner1@t.com", role="manager", role_kind="owner")
        assert user_permissions(u) == ALL_PERMISSIONS

    def test_owner_no_job_role_still_full(self, db_session: Session, test_tenant):
        u = _make_user(db_session, test_tenant, email="owner2@t.com", role="manager", role_kind="owner")
        assert u.job_role_id is None
        assert user_permissions(u) == ALL_PERMISSIONS


class TestUserPermissionsStaff:
    def test_kasiyer_has_correct_perms(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        kasiyer = next(r for r in roles if r.name == "Kasiyer")
        u = _make_user(
            db_session, test_tenant,
            email="kasiyer@t.com", role="employee",
            role_kind="staff", job_role_id=kasiyer.id,
        )
        perms = user_permissions(u)
        assert "sales.write" in perms
        assert "customers.read" in perms
        assert "catalog.product.read" in perms
        # Kasiyer stok yapamaz
        assert "stock.adjust" not in perms
        assert "finance.read" not in perms

    def test_depocu_has_correct_perms(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        depocu = next(r for r in roles if r.name == "Depocu")
        u = _make_user(
            db_session, test_tenant,
            email="depocu@t.com", role="employee",
            role_kind="staff", job_role_id=depocu.id,
        )
        perms = user_permissions(u)
        assert "stock.adjust" in perms
        assert "suppliers.read" in perms
        assert "sales.write" not in perms

    def test_muhasebe_has_correct_perms(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        muh = next(r for r in roles if r.name == "Muhasebe Asistanı")
        u = _make_user(
            db_session, test_tenant,
            email="muh@t.com", role="employee",
            role_kind="staff", job_role_id=muh.id,
        )
        perms = user_permissions(u)
        assert "cashbook.read" in perms
        assert "accounts.read" in perms
        assert "stock.adjust" not in perms

    def test_staff_without_job_role_returns_empty(self, db_session: Session, test_tenant):
        u = _make_user(
            db_session, test_tenant,
            email="notemplate@t.com", role="employee", role_kind="staff",
        )
        # job_role is None → no legacy fallback; izin yok (job_role atanmalı)
        assert user_permissions(u) == frozenset()


class TestUserPermissionsMeEndpoint:
    """/me returns the permissions from user_permissions(), not PERMISSION_MATRIX."""

    def test_me_returns_owner_all_perms(self, client, test_admin):
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        perms = set(r.json()["permissions"])
        # test_admin artık tenant owner (role_kind='owner') → ALL_PERMISSIONS
        assert "admin.access" in perms

    def test_me_permissions_is_list(self, client):
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        assert isinstance(r.json()["permissions"], list)
