"""tenant currency + language alanları (global iş temeli).

Revision ID: f1a2b3c4d5e6
Revises: b2c3d4e5f6a7
Create Date: 2026-05-29

Her tenant'ın temel para birimi (ISO 4217) ve dil tercihi (ISO 639-1).
Tüm parasal gösterim/raporlama ve UI/AI dili bunları temel alır.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f1a2b3c4d5e6"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("tenants")}
    with op.batch_alter_table("tenants", schema=None) as batch_op:
        if "currency" not in cols:
            batch_op.add_column(
                sa.Column("currency", sa.String(length=3), nullable=False, server_default="TRY")
            )
        if "language" not in cols:
            batch_op.add_column(
                sa.Column("language", sa.String(length=5), nullable=False, server_default="tr")
            )


def downgrade() -> None:
    with op.batch_alter_table("tenants", schema=None) as batch_op:
        batch_op.drop_column("language")
        batch_op.drop_column("currency")
