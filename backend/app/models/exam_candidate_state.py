import uuid

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExamCandidateState(Base):
    __tablename__ = "exam_candidate_states"

    state_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exams.exam_id"), nullable=False
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    warning_started_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True))
    locked_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True))
    lock_reason: Mapped[str | None] = mapped_column(String)
    last_event_type: Mapped[str | None] = mapped_column(String)
    last_seen_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("exam_id", "candidate_id", name="uq_exam_candidate_state"),
    )
