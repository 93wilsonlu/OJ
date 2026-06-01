import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class ExamCreate(BaseModel):
    title: str
    description: str | None = None
    start_time: datetime
    end_time: datetime
    show_score: bool = False

    @model_validator(mode="after")
    def _validate_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ExamUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    show_score: bool | None = None

    @model_validator(mode="after")
    def _validate_times(self):
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.end_time <= self.start_time
        ):
            raise ValueError("end_time must be after start_time")
        return self


class ExamOut(BaseModel):
    exam_id: uuid.UUID
    title: str
    description: str | None
    start_time: datetime
    end_time: datetime
    show_score: bool
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExamAssignmentCreate(BaseModel):
    candidate_id: uuid.UUID
    problem_id: uuid.UUID
    assigned_difficulty: str | None = None


class ExamAssignmentOut(BaseModel):
    assignment_id: uuid.UUID
    exam_id: uuid.UUID
    candidate_id: uuid.UUID
    problem_id: uuid.UUID
    assigned_difficulty: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExamProblemOut(BaseModel):
    assignment_id: uuid.UUID
    problem_id: uuid.UUID
    title: str
    description: str
    input_format: str | None
    output_format: str | None
    sample_input: str | None
    sample_output: str | None
    difficulty: str
    time_limit: int
    memory_limit: int
    allowed_langs: list[str]


class ExamCandidateStateOut(BaseModel):
    exam_id: uuid.UUID
    candidate_id: uuid.UUID
    status: str
    warning_started_at: datetime | None
    locked_at: datetime | None
    lock_reason: str | None
    last_event_type: str | None
    last_seen_at: datetime

    model_config = {"from_attributes": True}


class ProctoringEventCreate(BaseModel):
    event_type: str = Field(min_length=1, max_length=64)
    violating: bool
