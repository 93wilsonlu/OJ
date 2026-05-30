import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exam_assignment import ExamAssignment
from app.models.judge_result import JudgeResult
from app.models.problem import Problem
from app.models.submission import Submission
from app.models.user import User
from app.schemas.submission import SubmissionCreate
from app.services import queue as queue_service
from app.services import storage

RATE_LIMIT_SECONDS = 30
_LANG_EXT = {"python3": "py", "cpp17": "cpp"}


@dataclass
class SubmissionListRow:
    submission: Submission
    judge_result: JudgeResult | None
    problem_title: str
    candidate_name: str
    candidate_email: str
    exam_show_score: bool


async def _check_assignment(
    db: AsyncSession, candidate_id: uuid.UUID, exam_id: uuid.UUID, problem_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(ExamAssignment).where(
            ExamAssignment.exam_id == exam_id,
            ExamAssignment.candidate_id == candidate_id,
            ExamAssignment.problem_id == problem_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Not assigned to this problem in this exam")


async def _check_rate_limit(
    db: AsyncSession, candidate_id: uuid.UUID, exam_id: uuid.UUID, problem_id: uuid.UUID
) -> None:
    cutoff = datetime.now(UTC) - timedelta(seconds=RATE_LIMIT_SECONDS)
    result = await db.execute(
        select(Submission).where(
            Submission.candidate_id == candidate_id,
            Submission.exam_id == exam_id,
            Submission.problem_id == problem_id,
            Submission.submitted_at >= cutoff,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=429, detail="Rate limit: wait 30 seconds between submissions"
        )


async def create_submission(
    db: AsyncSession,
    data: SubmissionCreate,
    candidate_id: uuid.UUID,
    ip_address: str,
) -> Submission:
    exam = await db.get(Exam, data.exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")

    now = datetime.now(UTC)
    exam_end = exam.end_time if exam.end_time.tzinfo else exam.end_time.replace(tzinfo=UTC)
    if now > exam_end:
        raise HTTPException(status_code=403, detail="Exam has ended")

    await _check_assignment(db, candidate_id, data.exam_id, data.problem_id)
    await _check_rate_limit(db, candidate_id, data.exam_id, data.problem_id)

    submission_id = uuid.uuid4()
    ext = _LANG_EXT.get(data.language, "txt")
    code_key = f"submissions/{submission_id}/code.{ext}"
    storage.put_object(code_key, data.code.encode("utf-8"), "text/plain")

    submission = Submission(
        submission_id=submission_id,
        exam_id=data.exam_id,
        problem_id=data.problem_id,
        candidate_id=candidate_id,
        language=data.language,
        code_storage_key=code_key,
        status="pending",
        ip_address=ip_address,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    try:
        queue_service.enqueue_submission(submission_id)
    except Exception:
        submission.status = "failed"
        db.add(submission)
        await db.commit()

    return submission


async def get_submission(
    db: AsyncSession,
    submission_id: uuid.UUID,
    requester_id: uuid.UUID,
    requester_role: str,
) -> tuple[Submission, JudgeResult | None]:
    submission = await db.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    if requester_role == "candidate" and submission.candidate_id != requester_id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(JudgeResult).where(JudgeResult.submission_id == submission_id)
    )
    judge_result = result.scalar_one_or_none()
    return submission, judge_result


def get_submission_source_code(submission: Submission) -> str | None:
    try:
        return storage.get_object_text(submission.code_storage_key)
    except Exception:
        return None


async def list_submissions(
    db: AsyncSession,
    requester_id: uuid.UUID,
    requester_role: str,
    exam_id: uuid.UUID | None = None,
    candidate_id: uuid.UUID | None = None,
) -> list[SubmissionListRow]:
    stmt = (
        select(Submission, JudgeResult, Problem, User, Exam)
        .join(Problem, Submission.problem_id == Problem.problem_id)
        .join(User, Submission.candidate_id == User.user_id)
        .join(Exam, Submission.exam_id == Exam.exam_id)
        .outerjoin(JudgeResult, JudgeResult.submission_id == Submission.submission_id)
    )

    if requester_role == "candidate":
        stmt = stmt.where(Submission.candidate_id == requester_id)
    elif candidate_id is not None:
        stmt = stmt.where(Submission.candidate_id == candidate_id)

    if exam_id is not None:
        stmt = stmt.where(Submission.exam_id == exam_id)

    stmt = stmt.order_by(Submission.submitted_at.desc())
    result = await db.execute(stmt)
    return [
        SubmissionListRow(
            submission=submission,
            judge_result=judge_result,
            problem_title=problem.title,
            candidate_name=candidate.name,
            candidate_email=candidate.email,
            exam_show_score=exam.show_score,
        )
        for submission, judge_result, problem, candidate, exam in result.all()
    ]
