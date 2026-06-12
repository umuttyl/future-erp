"""supply_orders: add supplier_id nullable FK

Revision ID: e5f6a7b8c9d0
Revises: f1a2b3c4d5e6
Create Date: 2026-06-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("supply_orders", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("supplier_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_supply_orders_supplier_id",
            "suppliers",
            ["supplier_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_supply_orders_supplier_id", ["supplier_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("supply_orders", schema=None) as batch_op:
        batch_op.drop_index("ix_supply_orders_supplier_id")
        batch_op.drop_constraint("fk_supply_orders_supplier_id", type_="foreignkey")
        batch_op.drop_column("supplier_id")
