"""tenant: sector + active_modules + onboarding_completed kolonlari

Revision ID: d1e2f3a4b5c6
Revises: 1fd4b9730e80
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "1fd4b9730e80"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sektör kodu: "retail", "restaurant", "service", "production", "construction", "other"
    op.add_column(
        "tenants",
        sa.Column("sector", sa.String(64), nullable=True, default=None),
    )
    # Aktif modül listesi JSON string olarak: '["sales","inventory","finance"]'
    op.add_column(
        "tenants",
        sa.Column("active_modules", sa.Text(), nullable=True, default=None),
    )
    # Onboarding tamamlandı mı? False = yeni kayıt, ilk girişte onboarding sayfası açılır.
    op.add_column(
        "tenants",
        sa.Column(
            "onboarding_completed",
            sa.Boolean(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("tenants", "onboarding_completed")
    op.drop_column("tenants", "active_modules")
    op.drop_column("tenants", "sector")
