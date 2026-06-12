"""Tests for JobRoleTemplate model and seed helper."""
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.job_role_template import JobRoleTemplate
from app.services.job_role_seed import _SYSTEM_ROLES, seed_system_roles


class TestJobRoleTemplateModel:
    def test_table_name(self):
        assert JobRoleTemplate.__tablename__ == "job_role_templates"

    def test_required_columns(self):
        cols = {c.key for c in JobRoleTemplate.__table__.columns}
        assert {"id", "tenant_id", "name", "permissions", "is_system", "created_at"} <= cols

    def test_create_role(self, db_session: Session, test_tenant):
        role = JobRoleTemplate(
            tenant_id=test_tenant.id,
            name="Test Rolü",
            permissions=["sales.write", "customers.read"],
        )
        db_session.add(role)
        db_session.flush()
        assert role.id is not None
        assert role.is_system is False
        assert role.permissions == ["sales.write", "customers.read"]


class TestSeedSystemRoles:
    def test_seeds_exactly_five_roles(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        assert len(roles) == 5

    def test_role_names(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        names = {r.name for r in roles}
        assert names == {"Sahip", "Kasiyer", "Depocu", "Satış Temsilcisi", "Muhasebe Asistanı"}

    def test_all_system_flagged(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        assert all(r.is_system for r in roles)

    def test_owner_has_all_permissions(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        owner = next(r for r in roles if r.name == "Sahip")
        from app.core.permissions import ALL_PERMISSIONS
        assert set(ALL_PERMISSIONS) <= set(owner.permissions)

    def test_kasiyer_permissions(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        kasiyer = next(r for r in roles if r.name == "Kasiyer")
        perms = set(kasiyer.permissions)
        assert "sales.write" in perms
        assert "cashbook.write" in perms
        assert "customers.read" in perms
        assert "catalog.product.read" in perms
        assert "nlp.query.execute" in perms
        assert "stock.adjust" not in perms

    def test_depocu_permissions(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        depocu = next(r for r in roles if r.name == "Depocu")
        perms = set(depocu.permissions)
        assert "stock.adjust" in perms
        assert "catalog.product.read" in perms
        assert "catalog.product.write" in perms
        assert "suppliers.read" in perms
        assert "orders.read" in perms
        assert "sales.write" not in perms

    def test_satis_temsilcisi_permissions(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        satis = next(r for r in roles if r.name == "Satış Temsilcisi")
        perms = set(satis.permissions)
        assert "sales.write" in perms
        assert "customers.write" in perms
        assert "customers.read" in perms
        assert "catalog.product.read" in perms
        assert "nlp.query.execute" in perms
        assert "stock.adjust" not in perms
        assert "cashbook.write" not in perms

    def test_muhasebe_permissions(self, db_session: Session, test_tenant):
        roles = seed_system_roles(db_session, test_tenant.id)
        muhasebe = next(r for r in roles if r.name == "Muhasebe Asistanı")
        perms = set(muhasebe.permissions)
        assert "cashbook.read" in perms
        assert "cashbook.write" in perms
        assert "accounts.read" in perms
        assert "customers.read" in perms
        assert "finance.read" in perms
        assert "nlp.query.execute" in perms
        assert "sales.write" not in perms

    def test_roles_persisted_to_db(self, db_session: Session, test_tenant):
        seed_system_roles(db_session, test_tenant.id)
        rows = db_session.scalars(
            select(JobRoleTemplate).where(JobRoleTemplate.tenant_id == test_tenant.id)
        ).all()
        assert len(rows) == 5

    def test_tenant_scoped(self, db_session: Session, test_tenant):
        from app.models.tenant import Tenant
        other = Tenant(name="Other Org", slug="other-org")
        db_session.add(other)
        db_session.flush()

        seed_system_roles(db_session, test_tenant.id)
        seed_system_roles(db_session, other.id)

        tenant_roles = db_session.scalars(
            select(JobRoleTemplate).where(JobRoleTemplate.tenant_id == test_tenant.id)
        ).all()
        other_roles = db_session.scalars(
            select(JobRoleTemplate).where(JobRoleTemplate.tenant_id == other.id)
        ).all()
        assert len(tenant_roles) == 5
        assert len(other_roles) == 5


class TestRegisterNewTenantSeeds:
    """Integration: signup endpoint must seed roles for new tenant."""

    def test_signup_creates_five_roles(self, client_no_auth, db_session: Session):
        import uuid
        suf = uuid.uuid4().hex[:8]
        r = client_no_auth.post(
            "/api/auth/signup",
            json={
                "organization_name": f"Seed Test {suf}",
                "email": f"owner{suf}@example.com",
                "password": "Secret123!",
                "full_name": "Owner",
            },
        )
        assert r.status_code == 201, r.text

        from app.models.tenant import Tenant
        tenant = db_session.scalar(
            select(Tenant).where(Tenant.slug == r.json()["tenant_slug"])
        )
        assert tenant is not None

        roles = db_session.scalars(
            select(JobRoleTemplate).where(JobRoleTemplate.tenant_id == tenant.id)
        ).all()
        assert len(roles) == 5
        assert all(ro.is_system for ro in roles)
