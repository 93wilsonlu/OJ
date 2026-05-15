"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-15 06:08:41.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email", name="users_email_key"),
        sa.CheckConstraint(
            "role IN ('admin','interviewer','problem_admin','candidate')",
            name="users_role_check",
        ),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("token_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "problems",
        sa.Column("problem_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("input_format", sa.Text()),
        sa.Column("output_format", sa.Text()),
        sa.Column("sample_input", sa.Text()),
        sa.Column("sample_output", sa.Text()),
        sa.Column("difficulty", sa.Text(), nullable=False),
        sa.Column("time_limit", sa.Integer(), nullable=False),
        sa.Column("memory_limit", sa.Integer(), nullable=False),
        sa.Column("allowed_langs", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("difficulty IN ('easy','medium','hard')", name="problems_difficulty_check"),
    )

    op.create_table(
        "test_cases",
        sa.Column("testcase_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("problem_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("problems.problem_id"), nullable=False),
        sa.Column("input_data_key", sa.Text(), nullable=False),
        sa.Column("expected_output_key", sa.Text(), nullable=False),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("score_weight", sa.Numeric(5, 2), nullable=False, server_default="1.0"),
    )

    op.create_table(
        "exams",
        sa.Column("exam_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("show_score", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "exam_assignments",
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("exams.exam_id"), nullable=False),
        sa.Column("candidate_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("problem_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("problems.problem_id"), nullable=False),
        sa.Column("assigned_difficulty", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("exam_id", "candidate_id", "problem_id", name="uq_exam_candidate_problem"),
    )

    op.create_table(
        "submissions",
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("exams.exam_id"), nullable=False),
        sa.Column("problem_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("problems.problem_id"), nullable=False),
        sa.Column("candidate_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("language", sa.Text(), nullable=False),
        sa.Column("code_storage_key", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="'pending'"),
        sa.Column("ip_address", postgresql.INET(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("language IN ('python3','cpp17')", name="submissions_language_check"),
        sa.CheckConstraint("status IN ('pending','judging','completed','failed')", name="submissions_status_check"),
    )

    op.create_table(
        "judge_results",
        sa.Column("result_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.submission_id"), nullable=False, unique=True),
        sa.Column("verdict", sa.Text(), nullable=False),
        sa.Column("score", sa.Numeric(6, 2), nullable=False),
        sa.Column("passed_count", sa.Integer(), nullable=False),
        sa.Column("total_count", sa.Integer(), nullable=False),
        sa.Column("execution_time", sa.Integer()),
        sa.Column("memory_usage", sa.Integer()),
        sa.Column("error_message", sa.Text()),
        sa.Column("log_storage_key", sa.Text()),
        sa.Column("judged_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "verdict IN ('Accepted','Wrong Answer','Compile Error','Runtime Error',"
            "'Time Limit Exceeded','Memory Limit Exceeded','System Error')",
            name="judge_results_verdict_check",
        ),
    )


def downgrade() -> None:
    op.drop_table("judge_results")
    op.drop_table("submissions")
    op.drop_table("exam_assignments")
    op.drop_table("exams")
    op.drop_table("test_cases")
    op.drop_table("problems")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
