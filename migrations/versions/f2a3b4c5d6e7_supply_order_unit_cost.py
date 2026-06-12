"""supply_orders: add unit_cost column

Revision ID: f2a3b4c5d6e7
Revises: e5f6a7b8c9d0
Create Date: 2026-06-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("supply_orders", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("unit_cost", sa.Numeric(precision=14, scale=4), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("supply_orders", schema=None) as batch_op:
        batch_op.drop_column("unit_cost")
