"""add name column to test_cases

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-15 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("test_cases", sa.Column("name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("test_cases", "name")
