"""phase1 multi-tenant + auth (SQLite)

Revision ID: a8f1c2d3e4b5
Revises: 70e4ca5f7a10
Create Date: 2026-05-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a8f1c2d3e4b5"
down_revision: Union[str, Sequence[str], None] = "70e4ca5f7a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("tenants", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_tenants_slug"), ["slug"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
    )
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_users_email"), ["email"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_role"), ["role"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("refresh_tokens", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_refresh_tokens_token_hash"), ["token_hash"], unique=False)
        batch_op.create_index(batch_op.f("ix_refresh_tokens_user_id"), ["user_id"], unique=False)

    op.execute(
        sa.text("INSERT INTO tenants (id, name, slug) VALUES (1, 'Varsayılan', 'default')")
    )

    # --- products ---
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.execute(sa.text("UPDATE products SET tenant_id = 1"))
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.alter_column("tenant_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key("fk_products_tenant_id", "tenants", ["tenant_id"], ["id"], ondelete="CASCADE")
        batch_op.drop_index(batch_op.f("ix_products_sku"))
        batch_op.create_index(batch_op.f("ix_products_tenant_id"), ["tenant_id"], unique=False)
        batch_op.create_index("ix_products_tenant_sku", ["tenant_id", "sku"], unique=True)

    # --- sales_records ---
    with op.batch_alter_table("sales_records", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.execute(sa.text("UPDATE sales_records SET tenant_id = 1"))
    with op.batch_alter_table("sales_records", schema=None) as batch_op:
        batch_op.alter_column("tenant_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key("fk_sales_records_tenant_id", "tenants", ["tenant_id"], ["id"], ondelete="CASCADE")
        batch_op.drop_index(batch_op.f("ix_sales_records_record_no"))
        batch_op.create_index(batch_op.f("ix_sales_records_tenant_id"), ["tenant_id"], unique=False)
        batch_op.create_index("ix_sales_records_tenant_record_no", ["tenant_id", "record_no"], unique=True)

    # --- sales_items ---
    with op.batch_alter_table("sales_items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.execute(
        sa.text(
            "UPDATE sales_items SET tenant_id = "
            "(SELECT tenant_id FROM sales_records WHERE sales_records.id = sales_items.sales_record_id)"
        )
    )
    with op.batch_alter_table("sales_items", schema=None) as batch_op:
        batch_op.alter_column("tenant_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key("fk_sales_items_tenant_id", "tenants", ["tenant_id"], ["id"], ondelete="CASCADE")
        batch_op.create_index(batch_op.f("ix_sales_items_tenant_id"), ["tenant_id"], unique=False)

    # --- sales_forecast_results ---
    with op.batch_alter_table("sales_forecast_results", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.execute(sa.text("UPDATE sales_forecast_results SET tenant_id = 1"))
    with op.batch_alter_table("sales_forecast_results", schema=None) as batch_op:
        batch_op.alter_column("tenant_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key("fk_sales_forecast_results_tenant_id", "tenants", ["tenant_id"], ["id"], ondelete="CASCADE")
        batch_op.create_index(batch_op.f("ix_sales_forecast_results_tenant_id"), ["tenant_id"], unique=False)

    # --- stock_movements ---
    with op.batch_alter_table("stock_movements", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.execute(
        sa.text(
            "UPDATE stock_movements SET tenant_id = "
            "(SELECT tenant_id FROM products WHERE products.id = stock_movements.product_id)"
        )
    )
    with op.batch_alter_table("stock_movements", schema=None) as batch_op:
        batch_op.alter_column("tenant_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key("fk_stock_movements_tenant_id", "tenants", ["tenant_id"], ["id"], ondelete="CASCADE")
        batch_op.create_index(batch_op.f("ix_stock_movements_tenant_id"), ["tenant_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("stock_movements", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_stock_movements_tenant_id"))
        batch_op.drop_constraint("fk_stock_movements_tenant_id", type_="foreignkey")
        batch_op.drop_column("tenant_id")

    with op.batch_alter_table("sales_forecast_results", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sales_forecast_results_tenant_id"))
        batch_op.drop_constraint("fk_sales_forecast_results_tenant_id", type_="foreignkey")
        batch_op.drop_column("tenant_id")

    with op.batch_alter_table("sales_items", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sales_items_tenant_id"))
        batch_op.drop_constraint("fk_sales_items_tenant_id", type_="foreignkey")
        batch_op.drop_column("tenant_id")

    with op.batch_alter_table("sales_records", schema=None) as batch_op:
        batch_op.drop_index("ix_sales_records_tenant_record_no")
        batch_op.drop_index(batch_op.f("ix_sales_records_tenant_id"))
        batch_op.drop_constraint("fk_sales_records_tenant_id", type_="foreignkey")
        batch_op.drop_column("tenant_id")
        batch_op.create_index(batch_op.f("ix_sales_records_record_no"), ["record_no"], unique=True)

    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.drop_index("ix_products_tenant_sku")
        batch_op.drop_index(batch_op.f("ix_products_tenant_id"))
        batch_op.drop_constraint("fk_products_tenant_id", type_="foreignkey")
        batch_op.drop_column("tenant_id")
        batch_op.create_index(batch_op.f("ix_products_sku"), ["sku"], unique=True)

    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.drop_table("tenants")
