"""supply_orders: Actionable AI taslak tedarik satirlari

Revision ID: c3d4e5f6a7b8
Revises: b2a9c1d0e3f4
Create Date: 2026-05-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2a9c1d0e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "supply_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'Draft'"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("supply_orders", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_supply_orders_tenant_id"), ["tenant_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_supply_orders_product_id"), ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_table("supply_orders")
