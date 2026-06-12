"""sales_records_customer_id_fk

Revision ID: 63a7e2b20cf5
Revises: d1e2f3a4b5c6
Create Date: 2026-05-20 19:51:00.045074

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63a7e2b20cf5'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.add_column(sa.Column('customer_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_sales_records_customer_id'), ['customer_id'], unique=False)
        batch_op.create_foreign_key('fk_sales_records_customer_id', 'customers', ['customer_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sales_records_customer_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_sales_records_customer_id'))
        batch_op.drop_column('customer_id')
