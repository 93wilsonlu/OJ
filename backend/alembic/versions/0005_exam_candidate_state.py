"""add exam candidate proctoring state

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exam_candidate_states",
        sa.Column("state_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("exam_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("warning_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lock_reason", sa.String(), nullable=True),
        sa.Column("last_event_type", sa.String(), nullable=True),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.user_id"]),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.exam_id"]),
        sa.PrimaryKeyConstraint("state_id"),
        sa.UniqueConstraint("exam_id", "candidate_id", name="uq_exam_candidate_state"),
    )


def downgrade() -> None:
    op.drop_table("exam_candidate_states")
