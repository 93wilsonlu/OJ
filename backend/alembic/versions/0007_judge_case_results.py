"""add judge per-case results

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-10
"""

import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("judge_results", sa.Column("case_results", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("judge_results", "case_results")
