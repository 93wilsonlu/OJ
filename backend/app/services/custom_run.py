import json
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exam import Exam
from app.models.exam_assignment import ExamAssignment
from app.models.problem import Problem
from app.models.user import User
from app.schemas.submission import SubmissionRunCreate
from app.services import exam as exam_service
from app.services import proctoring as proctoring_service
from app.services import queue as queue_service
from lib.custom_run import (
    RUN_RESULT_TTL_SECONDS,
    _active_key,
    _run_key,
    get_redis,
)

RUN_RATE_LIMIT_SECONDS = 5


def _rate_key(candidate_id: uuid.UUID) -> str:
    return f"custom_run_rate:{candidate_id}"


async def _get_assigned_problem(
    db: AsyncSession,
    candidate_id: uuid.UUID,
    exam_id: uuid.UUID,
    problem_id: uuid.UUID,
) -> tuple[Exam, Problem]:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")

    problem = await db.get(Problem, problem_id)
    if problem is None:
        raise HTTPException(status_code=404, detail="Problem not found")

    result = await db.execute(
        select(ExamAssignment).where(
            ExamAssignment.exam_id == exam_id,
            ExamAssignment.candidate_id == candidate_id,
            ExamAssignment.problem_id == problem_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Not assigned to this problem in this exam")

    return exam, problem


def data_language_allowed(problem: Problem, language: str | None) -> bool:
    if language is None:
        return True
    return not problem.allowed_langs or language in problem.allowed_langs


async def create_run(
    db: AsyncSession,
    current_user: User,
    data: SubmissionRunCreate,
) -> dict:
    if current_user.role != "candidate":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    exam, problem = await _get_assigned_problem(
        db, current_user.user_id, data.exam_id, data.problem_id
    )
    access = await exam_service.get_exam_access(db, exam, current_user.user_id, "candidate")
    if not access.can_solve:
        raise HTTPException(status_code=403, detail="Exam is not accepting runs")

    await proctoring_service.ensure_candidate_not_locked(db, data.exam_id, current_user.user_id)

    if not data_language_allowed(problem, data.language):
        raise HTTPException(status_code=422, detail="Language is not allowed for this problem")

    redis_client = get_redis()
    active_key = _active_key(current_user.user_id)
    if redis_client.get(active_key):
        raise HTTPException(status_code=429, detail="A custom run is already active")

    rate_key = _rate_key(current_user.user_id)
    run_id = uuid.uuid4()
    if not redis_client.set(rate_key, str(run_id), nx=True, ex=RUN_RATE_LIMIT_SECONDS):
        raise HTTPException(status_code=429, detail="Wait before running again")

    redis_payload = {
        "run_id": str(run_id),
        "candidate_id": str(current_user.user_id),
        "status": "queued",
        "created_at": datetime.now(UTC).isoformat(),
    }
    pubsub_message = {
        "run_id": str(run_id),
        "candidate_id": str(current_user.user_id),
        "language": data.language,
        "code": data.code,
        "stdin": data.stdin,
        "time_limit": problem.time_limit,
        "memory_limit": problem.memory_limit,
    }

    redis_client.set(active_key, str(run_id), ex=RUN_RESULT_TTL_SECONDS)
    redis_client.setex(_run_key(run_id), RUN_RESULT_TTL_SECONDS, json.dumps(redis_payload))
    try:
        queue_service.enqueue_custom_run(pubsub_message)
    except Exception:
        redis_client.delete(active_key)
        redis_client.delete(_run_key(run_id))
        raise

    return {"run_id": run_id, "status": "queued"}


def get_run(current_user: User, run_id: uuid.UUID) -> dict:
    if current_user.role != "candidate":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    raw = get_redis().get(_run_key(run_id))
    if raw is None:
        raise HTTPException(status_code=404, detail="Run not found")

    payload = json.loads(raw)
    if payload.get("candidate_id") != str(current_user.user_id):
        raise HTTPException(status_code=404, detail="Run not found")
    return payload
