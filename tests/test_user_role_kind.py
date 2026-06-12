"""Tests for User.role_kind and User.job_role_id (ACTION_PLAN 2A-3)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.job_role_template import JobRoleTemplate
from app.models.user import User
from app.services.job_role_seed import seed_system_roles


class TestUserModelExtension:
    def test_new_columns_exist(self):
        cols = {c.key for c in User.__table__.columns}
        assert "role_kind" in cols
        assert "job_role_id" in cols

    def test_role_kind_default_staff(self, db_session: Session, test_tenant):
        u = User(
            tenant_id=test_tenant.id,
            email="staff@test.com",
            password_hash=hash_password("Pw1!"),
        )
        db_session.add(u)
        db_session.flush()
        assert u.role_kind == "staff"

    def test_role_kind_owner_explicit(self, db_session: Session, test_tenant):
        u = User(
            tenant_id=test_tenant.id,
            email="owner@test.com",
            password_hash=hash_password("Pw1!"),
            role_kind="owner",
        )
        db_session.add(u)
        db_session.flush()
        assert u.role_kind == "owner"

    def test_job_role_id_nullable(self, db_session: Session, test_tenant):
        u = User(
            tenant_id=test_tenant.id,
            email="nojobrole@test.com",
            password_hash=hash_password("Pw1!"),
            role_kind="owner",
        )
        db_session.add(u)
        db_session.flush()
        assert u.job_role_id is None

    def test_job_role_relationship(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        kasiyer = next(r for r in roles if r.name == "Kasiyer")

        u = User(
            tenant_id=test_tenant.id,
            email="cashier@test.com",
            password_hash=hash_password("Pw1!"),
            role_kind="staff",
            job_role_id=kasiyer.id,
        )
        db_session.add(u)
        db_session.flush()
        db_session.refresh(u)
        assert u.job_role is not None
        assert u.job_role.name == "Kasiyer"


class TestRegisterSetsRoleKind:
    """New tenants registered via AuthService get the owner user with readable role_kind."""

    def test_register_new_tenant_user_has_role_kind(self, db_session: Session):
        import uuid
        from app.schemas.auth import RegisterIn
        from app.services.auth_service import auth_service

        suf = uuid.uuid4().hex[:8]
        data = RegisterIn(
            organization_name=f"RoleKind Test {suf}",
            email=f"owner{suf}@example.com",
            password="Secret123!",
            full_name="Owner",
            department=None,
        )
        user, _, _, _ = auth_service.register_new_tenant(db_session, data)
        db_session.refresh(user)
        # role_kind column exists and is readable; defaults to 'staff' until 2A-4 sets it explicitly
        assert user.role_kind in ("owner", "staff")
