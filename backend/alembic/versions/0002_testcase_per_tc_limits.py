"""add per-test-case time/memory limit overrides

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-15 16:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("test_cases", sa.Column("time_limit_override", sa.Integer(), nullable=True))
    op.add_column("test_cases", sa.Column("memory_limit_override", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("test_cases", "memory_limit_override")
    op.drop_column("test_cases", "time_limit_override")
