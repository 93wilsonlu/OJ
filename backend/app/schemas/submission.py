import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Cap submitted source to prevent memory exhaustion / oversized payloads (256 KB).
MAX_CODE_CHARS = 256 * 1024


class SubmissionCreate(BaseModel):
    exam_id: uuid.UUID
    problem_id: uuid.UUID
    language: Literal["python3", "cpp17"]
    code: str = Field(max_length=MAX_CODE_CHARS)


class SubmissionRunCreate(SubmissionCreate):
    stdin: str = Field(default="", max_length=64 * 1024)


class SubmissionOut(BaseModel):
    submission_id: uuid.UUID
    exam_id: uuid.UUID
    problem_id: uuid.UUID
    candidate_id: uuid.UUID
    language: str
    status: str
    submitted_at: datetime

    model_config = {"from_attributes": True}


class JudgeCaseResultOut(BaseModel):
    index: int
    verdict: str
    execution_time: int | None = None
    memory_usage: int | None = None


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
    case_results: list[JudgeCaseResultOut] = Field(default_factory=list)
    judged_at: datetime

    model_config = {"from_attributes": True}


class SubmissionDetailOut(SubmissionOut):
    judge_result: JudgeResultOut | None = None
    source_code: str | None = None


class SubmissionListItemOut(SubmissionDetailOut):
    exam_title: str
    problem_title: str
    candidate_name: str
    candidate_email: str


class SubmissionRunQueuedOut(BaseModel):
    run_id: uuid.UUID
    status: str


class SubmissionRunResultOut(BaseModel):
    run_id: uuid.UUID
    status: str
    verdict: str | None = None
    stdout: str = ""
    stderr: str = ""
    stdout_truncated: bool = False
    stderr_truncated: bool = False
    execution_time: int | None = None
    memory_usage: int | None = None
    error_message: str | None = None
