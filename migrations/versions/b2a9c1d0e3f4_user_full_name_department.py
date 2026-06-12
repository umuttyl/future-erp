"""users: full_name, department (HR / profil)

Revision ID: b2a9c1d0e3f4
Revises: a8f1c2d3e4b5
Create Date: 2026-05-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2a9c1d0e3f4"
down_revision: Union[str, Sequence[str], None] = "a8f1c2d3e4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("full_name", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("department", sa.String(length=128), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("department")
        batch_op.drop_column("full_name")
