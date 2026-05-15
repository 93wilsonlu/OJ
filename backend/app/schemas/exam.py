import uuid
from datetime import datetime

from pydantic import BaseModel


class ExamCreate(BaseModel):
    title: str
    description: str | None = None
    start_time: datetime
    end_time: datetime
    show_score: bool = False


class ExamUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    show_score: bool | None = None


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
