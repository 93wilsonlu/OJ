"""store observability state in postgres

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-11
"""

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("judge_results", sa.Column("judge_duration_ms", sa.Integer(), nullable=True))
    op.add_column(
        "judge_results",
        sa.Column("stuck_marked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_table(
        "worker_heartbeats",
        sa.Column("worker_id", sa.String(), nullable=False),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("worker_id"),
    )


def downgrade() -> None:
    op.drop_table("worker_heartbeats")
    op.drop_column("judge_results", "stuck_marked")
    op.drop_column("judge_results", "judge_duration_ms")
