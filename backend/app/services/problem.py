import uuid

import anyio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam_assignment import ExamAssignment
from app.models.problem import Problem
from app.models.submission import Submission
from app.models.test_case import TestCase
from app.schemas.problem import ProblemCreate, ProblemUpdate
from app.services import storage


async def list_problems(db: AsyncSession) -> list[Problem]:
    result = await db.execute(select(Problem).order_by(Problem.created_at.desc()))
    return list(result.scalars())


async def get_problem(db: AsyncSession, problem_id: uuid.UUID) -> Problem:
    problem = await db.get(Problem, problem_id)
    if problem is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return problem


async def create_problem(
    db: AsyncSession, data: ProblemCreate, creator_id: uuid.UUID
) -> Problem:
    problem = Problem(
        title=data.title,
        description=data.description,
        input_format=data.input_format,
        output_format=data.output_format,
        sample_input=data.sample_input,
        sample_output=data.sample_output,
        difficulty=data.difficulty,
        time_limit=data.time_limit,
        memory_limit=data.memory_limit,
        allowed_langs=data.allowed_langs,
        created_by=creator_id,
    )
    db.add(problem)
    await db.commit()
    await db.refresh(problem)
    return problem


async def update_problem(
    db: AsyncSession, problem: Problem, data: ProblemUpdate
) -> Problem:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(problem, field, value)
    await db.commit()
    await db.refresh(problem)
    return problem


async def delete_problem(db: AsyncSession, problem: Problem) -> None:
    pid = problem.problem_id

    # Remove dependent rows that have no DB-level cascade
    for model, col in (
        (Submission, Submission.problem_id),
        (ExamAssignment, ExamAssignment.problem_id),
    ):
        result = await db.execute(select(model).where(col == pid))
        for row in result.scalars():
            await db.delete(row)

    result = await db.execute(select(TestCase).where(TestCase.problem_id == pid))
    for tc in result.scalars():
        await _remove_tc_objects(tc)
        await db.delete(tc)

    await db.delete(problem)
    await db.commit()


async def list_test_cases(
    db: AsyncSession, problem_id: uuid.UUID, include_hidden: bool = False
) -> list[TestCase]:
    stmt = select(TestCase).where(TestCase.problem_id == problem_id)
    if not include_hidden:
        stmt = stmt.where(TestCase.is_hidden.is_(False))
    result = await db.execute(stmt)
    return list(result.scalars())


async def get_test_case(
    db: AsyncSession, problem_id: uuid.UUID, testcase_id: uuid.UUID
) -> TestCase:
    result = await db.execute(
        select(TestCase).where(
            TestCase.testcase_id == testcase_id,
            TestCase.problem_id == problem_id,
        )
    )
    tc = result.scalar_one_or_none()
    if tc is None:
        raise HTTPException(status_code=404, detail="Test case not found")
    return tc


async def create_test_case(
    db: AsyncSession,
    problem_id: uuid.UUID,
    input_bytes: bytes,
    expected_bytes: bytes,
    is_hidden: bool,
    score_weight: float,
    name: str | None = None,
    time_limit_override: int | None = None,
    memory_limit_override: int | None = None,
) -> TestCase:
    tc_id = uuid.uuid4()
    input_key = f"testcases/{problem_id}/{tc_id}/input"
    expected_key = f"testcases/{problem_id}/{tc_id}/expected"

    await anyio.to_thread.run_sync(storage.put_object, input_key, input_bytes)
    await anyio.to_thread.run_sync(storage.put_object, expected_key, expected_bytes)

    tc = TestCase(
        testcase_id=tc_id,
        problem_id=problem_id,
        input_data_key=input_key,
        expected_output_key=expected_key,
        is_hidden=is_hidden,
        score_weight=score_weight,
        name=name or None,
        time_limit_override=time_limit_override,
        memory_limit_override=memory_limit_override,
    )
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return tc


async def update_test_case(
    db: AsyncSession,
    tc: TestCase,
    is_hidden: bool,
    score_weight: float,
    name: str | None,
    time_limit_override: int | None,
    memory_limit_override: int | None,
    input_bytes: bytes | None = None,
    expected_bytes: bytes | None = None,
) -> TestCase:
    tc.is_hidden = is_hidden
    tc.score_weight = score_weight
    tc.name = name or None
    tc.time_limit_override = time_limit_override
    tc.memory_limit_override = memory_limit_override
    if input_bytes is not None:
        await anyio.to_thread.run_sync(storage.put_object, tc.input_data_key, input_bytes)
    if expected_bytes is not None:
        await anyio.to_thread.run_sync(storage.put_object, tc.expected_output_key, expected_bytes)
    await db.commit()
    await db.refresh(tc)
    return tc


async def delete_test_case(db: AsyncSession, tc: TestCase) -> None:
    await _remove_tc_objects(tc)
    await db.delete(tc)
    await db.commit()


async def _remove_tc_objects(tc: TestCase) -> None:
    for key in (tc.input_data_key, tc.expected_output_key):
        try:
            await anyio.to_thread.run_sync(storage.delete_object, key)
        except Exception:
            pass  # best-effort; DB record deleted regardless
