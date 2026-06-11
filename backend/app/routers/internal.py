import hmac
import json
import uuid
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.judge_result import JudgeResult
from app.models.submission import Submission
from app.models.worker_heartbeat import WorkerHeartbeat
from lib.custom_run import RUN_RESULT_TTL_SECONDS, _active_key, _run_key, get_redis

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])

SYSTEM_ERROR_MESSAGE = (
    "An internal error occurred while judging this submission. "
    "Please contact the administrator."
)


def _require_token(x_internal_token: str = Header(default=None)) -> None:
    if not x_internal_token or not hmac.compare_digest(x_internal_token, settings.INTERNAL_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid or missing internal token")


class JudgeResultIn(BaseModel):
    submission_id: uuid.UUID
    verdict: str
    score: float
    passed_count: int
    total_count: int
    execution_time: int   # ms
    memory_usage: int     # MB
    judge_duration_ms: int | None = None
    error_message: str | None
    case_results: list[dict] = Field(default_factory=list)
    submission_status: str  # "completed" or "failed"


class JudgeStartIn(BaseModel):
    submission_id: uuid.UUID


class RunResultIn(BaseModel):
    run_id: uuid.UUID
    verdict: str
    execution_time: int       # ms
    memory_usage: int         # KB
    stdout: str = ""
    stderr: str = ""
    stdout_truncated: bool = False
    stderr_truncated: bool = False
    error_message: str | None = None


class WorkerHeartbeatIn(BaseModel):
    worker_id: str = "default"


@router.post("/judge-start", status_code=204)
async def judge_start(
    body: JudgeStartIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_token),
) -> None:
    submission = await db.get(Submission, body.submission_id)
    if submission is None or submission.status != "pending":
        return
    submission.status = "judging"
    await db.commit()


@router.post("/judge-result", status_code=204)
async def judge_result(
    body: JudgeResultIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_token),
) -> None:
    existing = await db.execute(
        select(JudgeResult).where(JudgeResult.submission_id == body.submission_id)
    )
    if existing.scalar_one_or_none() is not None:
        return  # idempotent

    submission = await db.get(Submission, body.submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    jr = JudgeResult(
        submission_id=body.submission_id,
        verdict=body.verdict,
        score=body.score,
        passed_count=body.passed_count,
        total_count=body.total_count,
        execution_time=body.execution_time,
        judge_duration_ms=body.judge_duration_ms,
        memory_usage=body.memory_usage,
        error_message=body.error_message,
        case_results=body.case_results,
    )
    db.add(jr)
    submission.status = body.submission_status
    await db.commit()
    logger.info(
        "internal.judge_result.stored",
        submission_id=str(body.submission_id),
        verdict=body.verdict,
    )


@router.post("/worker-heartbeat", status_code=204)
async def worker_heartbeat(
    body: WorkerHeartbeatIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_token),
) -> None:
    heartbeat = await db.get(WorkerHeartbeat, body.worker_id)
    if heartbeat is None:
        db.add(WorkerHeartbeat(worker_id=body.worker_id))
    else:
        heartbeat.last_seen_at = datetime.now(UTC)
    await db.commit()
    logger.debug("internal.worker_heartbeat.stored", worker_id=body.worker_id)


@router.post("/run-result", status_code=204)
async def run_result(
    body: RunResultIn,
    _: None = Depends(_require_token),
) -> None:
    redis_client = get_redis()
    key = _run_key(body.run_id)
    raw = redis_client.get(key)
    if raw is None:
        return  # expired or never existed; idempotent
    record = json.loads(raw)
    if record.get("status") not in ("queued", "running"):
        return  # already completed; idempotent
    record.update({
        "status": "completed",
        "verdict": body.verdict,
        "execution_time": body.execution_time,
        "memory_usage": body.memory_usage,
        "stdout": body.stdout,
        "stderr": body.stderr,
        "stdout_truncated": body.stdout_truncated,
        "stderr_truncated": body.stderr_truncated,
        "error_message": body.error_message,
    })
    redis_client.setex(key, RUN_RESULT_TTL_SECONDS, json.dumps(record))
    candidate_id = record.get("candidate_id")
    if candidate_id:
        redis_client.delete(_active_key(uuid.UUID(candidate_id)))
    logger.info("internal.run_result.stored", run_id=str(body.run_id), verdict=body.verdict)


@router.post("/mark-stuck", status_code=200)
async def mark_stuck(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_token),
) -> dict:
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.STUCK_SUBMISSION_SECONDS)
    result = await db.execute(
        select(Submission).where(
            Submission.status == "judging",
            Submission.submitted_at < cutoff,
        )
    )
    submissions = result.scalars().all()
    marked = 0
    for submission in submissions:
        existing = await db.execute(
            select(JudgeResult).where(JudgeResult.submission_id == submission.submission_id)
        )
        if existing.scalar_one_or_none() is None:
            db.add(
                JudgeResult(
                    submission_id=submission.submission_id,
                    verdict="System Error",
                    score=0,
                    passed_count=0,
                    total_count=0,
                    execution_time=0,
                    judge_duration_ms=None,
                    memory_usage=0,
                    error_message=SYSTEM_ERROR_MESSAGE,
                    case_results=[],
                    stuck_marked=True,
                )
            )
        submission.status = "failed"
        marked += 1

    if marked:
        await db.commit()
        logger.warning("internal.mark_stuck.marked", count=marked)

    return {"marked": marked}
