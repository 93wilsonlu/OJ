import uuid

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TestCase(Base):
    __tablename__ = "test_cases"

    testcase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    problem_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("problems.problem_id"), nullable=False
    )
    input_data_key: Mapped[str] = mapped_column(String, nullable=False)
    expected_output_key: Mapped[str] = mapped_column(String, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    score_weight: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=1.0)
