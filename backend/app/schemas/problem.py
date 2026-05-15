import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ProblemCreate(BaseModel):
    title: str
    description: str
    input_format: str | None = None
    output_format: str | None = None
    sample_input: str | None = None
    sample_output: str | None = None
    difficulty: Literal["easy", "medium", "hard"]
    time_limit: int = Field(gt=0)       # milliseconds
    memory_limit: int = Field(gt=0)     # MB
    allowed_langs: list[str] = Field(min_length=1)


class ProblemUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    input_format: str | None = None
    output_format: str | None = None
    sample_input: str | None = None
    sample_output: str | None = None
    difficulty: Literal["easy", "medium", "hard"] | None = None
    time_limit: int | None = Field(None, gt=0)
    memory_limit: int | None = Field(None, gt=0)
    allowed_langs: list[str] | None = None


class ProblemOut(BaseModel):
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
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TestCaseOut(BaseModel):
    testcase_id: uuid.UUID
    problem_id: uuid.UUID
    name: str | None
    is_hidden: bool
    score_weight: float
    time_limit_override: int | None
    memory_limit_override: int | None

    model_config = {"from_attributes": True}
