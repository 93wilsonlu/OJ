"""add exam attempt timing

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-03 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column(
            "anti_cheat_enabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column("exams", sa.Column("test_time_minutes", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "exams_test_time_minutes_positive_check",
        "exams",
        "test_time_minutes IS NULL OR test_time_minutes > 0",
    )

    op.create_table(
        "exam_attempts",
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("exam_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("fullscreen_exit_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("force_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('in_progress','ended','force_ended')",
            name="exam_attempts_status_check",
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.user_id"]),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.exam_id"]),
        sa.PrimaryKeyConstraint("attempt_id"),
        sa.UniqueConstraint("exam_id", "candidate_id", name="uq_exam_attempt_candidate"),
    )


def downgrade() -> None:
    op.drop_table("exam_attempts")
    op.drop_constraint("exams_test_time_minutes_positive_check", "exams", type_="check")
    op.drop_column("exams", "test_time_minutes")
    op.drop_column("exams", "anti_cheat_enabled")
