import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

UserRole = Literal["admin", "interviewer", "problem_admin", "candidate"]


class AdminUserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole


class AdminUserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    role: UserRole | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    is_active: bool | None = None


class AdminUserOut(BaseModel):
    user_id: uuid.UUID
    name: str
    email: EmailStr
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminUserListOut(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class ExamProblemResultOut(BaseModel):
    problem_id: uuid.UUID
    title: str
    best_score: float | None
    submission_count: int
    latest_verdict: str | None


class ExamCandidateResultOut(BaseModel):
    candidate_id: uuid.UUID
    name: str
    email: EmailStr
    problems: list[ExamProblemResultOut]
    total_score: float


class ExamResultsOut(BaseModel):
    exam_id: uuid.UUID
    title: str
    candidates: list[ExamCandidateResultOut]
