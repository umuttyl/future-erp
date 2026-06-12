"""add composite indexes for performance

Revision ID: d2c4e7deffe0
Revises: 7afdfc50ada7
Create Date: 2026-05-27 23:17:45.090531

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2c4e7deffe0'
down_revision: Union[str, Sequence[str], None] = '7afdfc50ada7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_record_comments_tenant_entity", "record_comments",
                    ["tenant_id", "entity_type", "entity_id"], if_not_exists=True)
    op.create_index("ix_record_tags_tenant_entity", "record_tags",
                    ["tenant_id", "entity_type", "entity_id"], if_not_exists=True)
    op.create_index("ix_account_movement_tenant_created", "account_movements",
                    ["tenant_id", "created_at"], if_not_exists=True)
    op.create_index("ix_sales_records_tenant_date", "sales_records",
                    ["tenant_id", "sale_date"], if_not_exists=True)
    op.create_index("ix_stock_movements_tenant_product", "stock_movements",
                    ["tenant_id", "product_id", "created_at"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_stock_movements_tenant_product", table_name="stock_movements")
    op.drop_index("ix_sales_records_tenant_date", table_name="sales_records")
    op.drop_index("ix_account_movement_tenant_created", table_name="account_movements")
    op.drop_index("ix_record_tags_tenant_entity", table_name="record_tags")
    op.drop_index("ix_record_comments_tenant_entity", table_name="record_comments")
