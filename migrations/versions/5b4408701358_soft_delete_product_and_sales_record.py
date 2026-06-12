"""soft_delete_product_and_sales_record

Revision ID: 5b4408701358
Revises: 07eb6fec8ae7
Create Date: 2026-05-28 01:09:21.550308

Adds deleted_at (nullable DateTime) to products and sales_records
to support soft-delete instead of hard DELETE.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5b4408701358'
down_revision: Union[str, Sequence[str], None] = '07eb6fec8ae7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.drop_column('deleted_at')

    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_column('deleted_at')
