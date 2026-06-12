"""role sütunu → is_platform_admin bool; tenant_id nullable; audit_logs nullable.

Revision ID: a1b2c3d4e5f6
Revises: 5b4408701358
Create Date: 2026-05-28

Bu migration ADM-10 kapsamında:
- User.is_platform_admin: bool eklenir (role='admin' kullanıcıları True olur)
- User.tenant_id nullable yapılır (platform admin için NULL)
- User.role sütunu kaldırılır
- AuditLog.actor_tenant_id nullable yapılır
- Partial unique index: tenant_id IS NOT NULL satırlar için
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "5b4408701358"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("users")}

    # ── 1. is_platform_admin henüz yoksa ekle ────────────────────────────────
    if "is_platform_admin" not in existing_cols:
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default="0")
            )

    # ── 2. role='admin' olanları is_platform_admin=1 yap (role henüz varsa) ─
    if "role" in existing_cols:
        op.execute("UPDATE users SET is_platform_admin = 1 WHERE role = 'admin'")

    # ── 3. tenant_id nullable yap + role sütununu kaldır (gerekiyorsa) ───────
    need_schema_change = "role" in existing_cols
    if not need_schema_change:
        # role zaten kaldırılmış; tenant_id nullable mı kontrol et
        col_info = {c["name"]: c for c in insp.get_columns("users")}
        tenant_nullable = col_info.get("tenant_id", {}).get("nullable", True)
        need_schema_change = not tenant_nullable

    if need_schema_change:
        # Mevcut ix_users_role indeksini sil (role kolonu kalkınca bu indeks geçersiz)
        existing_indexes = {idx["name"] for idx in insp.get_indexes("users")}
        with op.batch_alter_table("users", schema=None) as batch_op:
            if "ix_users_role" in existing_indexes:
                batch_op.drop_index("ix_users_role")
            batch_op.alter_column("tenant_id", existing_type=sa.Integer(), nullable=True)
            if "role" in existing_cols:
                batch_op.drop_column("role")

    # ── 4. Platform admin kullanıcılarının tenant_id'sini NULL yap ───────────
    op.execute("UPDATE users SET tenant_id = NULL WHERE is_platform_admin = 1")

    # ── 5. Partial unique index: sadece tenant_id IS NOT NULL satırlar ────────
    #    (admin kullanıcılar NULL tenant_id ile aynı e-postaya izin vermez)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email_nonnull "
        "ON users(tenant_id, email) WHERE tenant_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_admin_email "
        "ON users(email) WHERE is_platform_admin = 1"
    )

    # ── 6. AuditLog.actor_tenant_id nullable ──────────────────────────────────
    with op.batch_alter_table("audit_logs", schema=None) as batch_op:
        batch_op.alter_column(
            "actor_tenant_id",
            existing_type=sa.Integer(),
            nullable=True,
        )


def downgrade() -> None:
    # Audit log geri al
    with op.batch_alter_table("audit_logs", schema=None) as batch_op:
        batch_op.alter_column("actor_tenant_id", existing_type=sa.Integer(), nullable=False)

    # Partial index'leri sil
    op.execute("DROP INDEX IF EXISTS uq_users_tenant_email_nonnull")
    op.execute("DROP INDEX IF EXISTS uq_platform_admin_email")

    # role sütununu geri ekle, is_platform_admin'dan türet
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("role", sa.String(32), nullable=False, server_default="employee")
        )
        batch_op.alter_column("tenant_id", existing_type=sa.Integer(), nullable=False)

    op.execute("UPDATE users SET role = 'admin' WHERE is_platform_admin = 1")
    op.execute("UPDATE users SET role = 'manager' WHERE is_platform_admin = 0 AND role_kind = 'owner'")
    op.execute("UPDATE users SET role = 'employee' WHERE is_platform_admin = 0 AND role_kind = 'staff'")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("is_platform_admin")
