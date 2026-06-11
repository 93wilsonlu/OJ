import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

VERDICTS = (
    "Accepted",
    "Wrong Answer",
    "Compile Error",
    "Runtime Error",
    "Time Limit Exceeded",
    "Memory Limit Exceeded",
    "System Error",
)


class JudgeResult(Base):
    __tablename__ = "judge_results"

    result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.submission_id"),
        nullable=False,
        unique=True,
    )
    verdict: Mapped[str] = mapped_column(String, nullable=False)
    score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    passed_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_count: Mapped[int] = mapped_column(Integer, nullable=False)
    execution_time: Mapped[int | None] = mapped_column(Integer)  # ms
    judge_duration_ms: Mapped[int | None] = mapped_column(Integer)
    memory_usage: Mapped[int | None] = mapped_column(Integer)  # MB
    error_message: Mapped[str | None] = mapped_column(Text)
    case_results: Mapped[list[dict] | None] = mapped_column(JSON)
    stuck_marked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    log_storage_key: Mapped[str | None] = mapped_column(String)
    judged_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "verdict IN ('Accepted','Wrong Answer','Compile Error','Runtime Error',"
            "'Time Limit Exceeded','Memory Limit Exceeded','System Error')",
            name="judge_results_verdict_check",
        ),
    )
