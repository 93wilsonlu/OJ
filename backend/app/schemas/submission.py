import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SubmissionCreate(BaseModel):
    exam_id: uuid.UUID
    problem_id: uuid.UUID
    language: Literal["python3", "cpp17"]
    code: str


class SubmissionOut(BaseModel):
    submission_id: uuid.UUID
    exam_id: uuid.UUID
    problem_id: uuid.UUID
    candidate_id: uuid.UUID
    language: str
    status: str
    submitted_at: datetime

    model_config = {"from_attributes": True}


class JudgeResultOut(BaseModel):
    result_id: uuid.UUID
    submission_id: uuid.UUID
    verdict: str
    score: float | None
    passed_count: int | None
    total_count: int
    execution_time: int | None
    memory_usage: int | None
    error_message: str | None
    judged_at: datetime

    model_config = {"from_attributes": True}


class SubmissionDetailOut(SubmissionOut):
    judge_result: JudgeResultOut | None = None


class SubmissionListItemOut(SubmissionDetailOut):
    problem_title: str
    candidate_name: str
    candidate_email: str
