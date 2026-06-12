"""platform_users tablosunu kaldır (ADM-10 sonrası ölü kod).

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-29

ADM-10 ile platform admin mekanizması User.is_platform_admin'e taşındı.
PlatformUser modeli/tablosu artık hiçbir iş mantığında kullanılmıyor → kaldırılır.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "platform_users" in insp.get_table_names():
        existing_indexes = {idx["name"] for idx in insp.get_indexes("platform_users")}
        if "ix_platform_users_email" in existing_indexes:
            with op.batch_alter_table("platform_users", schema=None) as batch_op:
                batch_op.drop_index("ix_platform_users_email")
        op.drop_table("platform_users")


def downgrade() -> None:
    # Geri alma: tabloyu yeniden oluştur (legacy şema)
    op.create_table(
        "platform_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("platform_users", schema=None) as batch_op:
        batch_op.create_index("ix_platform_users_email", ["email"], unique=True)
