"""sales_record_payment_type_and_auto_entries

Revision ID: 07eb6fec8ae7
Revises: d2c4e7deffe0
Create Date: 2026-05-28 00:56:15.893882

Adds payment_type column to sales_records.
nakit  → otomatik CashTransaction(income) oluşturulur
kredi  → sadece AccountMovement(debit), nakit hareketi yok
banka_havalesi → otomatik CashTransaction(income) banka hesabına
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '07eb6fec8ae7'
down_revision: Union[str, Sequence[str], None] = 'd2c4e7deffe0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'payment_type',
                sa.String(24),
                nullable=False,
                server_default='nakit',
            )
        )


def downgrade() -> None:
    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.drop_column('payment_type')
