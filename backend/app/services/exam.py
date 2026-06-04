import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exam_assignment import ExamAssignment
from app.models.exam_attempt import ExamAttempt
from app.models.exam_candidate_state import ExamCandidateState
from app.models.judge_result import JudgeResult
from app.models.problem import Problem
from app.models.submission import Submission
from app.schemas.exam import ExamAssignmentCreate, ExamCreate, ExamUpdate
from app.services import proctoring as proctoring_service

FULLSCREEN_EXIT_GRACE_SECONDS = 5


@dataclass
class ExamProblemRow:
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


@dataclass(frozen=True)
class ExamAccess:
    exam_id: uuid.UUID
    status_label: str
    can_view_exam: bool
    can_view_problems: bool
    can_start: bool
    can_solve: bool
    can_submit: bool
    can_edit_submission: bool
    can_view_submissions: bool
    requires_fullscreen: bool
    attempt_started_at: datetime | None
    attempt_deadline_at: datetime | None
    attempt_ended_at: datetime | None


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _validate_exam_settings(
    *,
    start_time: datetime,
    end_time: datetime,
    anti_cheat_enabled: bool,
    test_time_minutes: int | None,
) -> None:
    if end_time <= start_time:
        raise HTTPException(status_code=422, detail="end_time must be after start_time")
    if anti_cheat_enabled and test_time_minutes is None:
        raise HTTPException(
            status_code=422,
            detail="test_time_minutes is required when anti-cheat is enabled",
        )
    if test_time_minutes is not None and test_time_minutes <= 0:
        raise HTTPException(status_code=422, detail="test_time_minutes must be positive")


def _is_attempt_expired(attempt: ExamAttempt, now: datetime) -> bool:
    return attempt.status == "in_progress" and now > _as_utc(attempt.deadline_at)


def _should_force_end_attempt(attempt: ExamAttempt, now: datetime) -> bool:
    return (
        attempt.status == "in_progress"
        and attempt.force_end_at is not None
        and now > _as_utc(attempt.force_end_at)
    )


def _attempt_deadline(exam: Exam, started_at: datetime) -> datetime:
    if exam.test_time_minutes is None:
        raise HTTPException(
            status_code=422,
            detail="test_time_minutes is required when anti-cheat is enabled",
        )
    test_deadline = started_at + timedelta(minutes=exam.test_time_minutes)
    return min(test_deadline, _as_utc(exam.end_time))


async def _force_end_attempt_if_needed(
    db: AsyncSession,
    attempt: ExamAttempt,
    now: datetime,
) -> ExamAttempt:
    if not _should_force_end_attempt(attempt, now):
        return attempt

    attempt.status = "force_ended"
    attempt.ended_at = _as_utc(attempt.force_end_at)
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


async def list_exams(db: AsyncSession, user_id: uuid.UUID, role: str) -> list[Exam]:
    if role == "candidate":
        stmt = (
            select(Exam)
            .join(ExamAssignment, ExamAssignment.exam_id == Exam.exam_id)
            .where(ExamAssignment.candidate_id == user_id)
            .distinct()
            .order_by(Exam.start_time.desc())
        )
    else:
        stmt = select(Exam).order_by(Exam.start_time.desc())
    result = await db.execute(stmt)
    return list(result.scalars())


async def get_exam(db: AsyncSession, exam_id: uuid.UUID) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


async def get_exam_for_user(
    db: AsyncSession, exam_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> Exam:
    """Fetch an exam, enforcing candidate assignment scope.

    Candidates may only read exams they're assigned to; otherwise 404 (not 403,
    to avoid leaking exam existence by UUID).
    """
    exam = await get_exam(db, exam_id)
    if role == "candidate":
        result = await db.execute(
            select(ExamAssignment.assignment_id)
            .where(
                ExamAssignment.exam_id == exam_id,
                ExamAssignment.candidate_id == user_id,
            )
            .limit(1)
        )
        if result.first() is None:
            raise HTTPException(status_code=404, detail="Exam not found")
    return exam


async def get_owned_exam(
    db: AsyncSession, exam_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> Exam:
    """Fetch an exam, enforcing owner-or-admin write scope (I5).

    Interviewers may modify only exams they created; admins may modify any.
    """
    exam = await get_exam(db, exam_id)
    if role != "admin" and exam.created_by != user_id:
        raise HTTPException(status_code=403, detail="Not the owner of this exam")
    return exam


async def create_exam(db: AsyncSession, data: ExamCreate, creator_id: uuid.UUID) -> Exam:
    _validate_exam_settings(
        start_time=data.start_time,
        end_time=data.end_time,
        anti_cheat_enabled=data.anti_cheat_enabled,
        test_time_minutes=data.test_time_minutes,
    )
    exam = Exam(
        title=data.title,
        description=data.description,
        start_time=data.start_time,
        end_time=data.end_time,
        show_score=data.show_score,
        anti_cheat_enabled=data.anti_cheat_enabled,
        test_time_minutes=data.test_time_minutes,
        created_by=creator_id,
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return exam


async def update_exam(db: AsyncSession, exam: Exam, data: ExamUpdate) -> Exam:
    values = data.model_dump(exclude_unset=True)
    merged = {
        "start_time": values.get("start_time", exam.start_time),
        "end_time": values.get("end_time", exam.end_time),
        "anti_cheat_enabled": values.get(
            "anti_cheat_enabled", exam.anti_cheat_enabled
        ),
        "test_time_minutes": values.get("test_time_minutes", exam.test_time_minutes),
    }
    _validate_exam_settings(**merged)
    for field, value in values.items():
        setattr(exam, field, value)
    await db.commit()
    await db.refresh(exam)
    return exam


async def delete_exam(db: AsyncSession, exam: Exam) -> None:
    eid = exam.exam_id

    # Dependent rows have no DB-level ON DELETE CASCADE, and these models declare
    # no ORM relationship() — so the unit-of-work can't infer the FK delete order
    # and may emit `DELETE FROM exams` before its children, violating
    # exam_assignments_exam_id_fkey. Issue explicit deletes in FK order, which run
    # immediately in the order written.
    sub_ids = select(Submission.submission_id).where(Submission.exam_id == eid)
    await db.execute(delete(JudgeResult).where(JudgeResult.submission_id.in_(sub_ids)))
    await db.execute(delete(Submission).where(Submission.exam_id == eid))
    await db.execute(delete(ExamCandidateState).where(ExamCandidateState.exam_id == eid))
    await db.execute(delete(ExamAttempt).where(ExamAttempt.exam_id == eid))
    await db.execute(delete(ExamAssignment).where(ExamAssignment.exam_id == eid))
    await db.execute(delete(Exam).where(Exam.exam_id == eid))
    await db.commit()


async def get_exam_attempt(
    db: AsyncSession,
    exam_id: uuid.UUID,
    candidate_id: uuid.UUID,
) -> ExamAttempt | None:
    result = await db.execute(
        select(ExamAttempt).where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.candidate_id == candidate_id,
        )
    )
    return result.scalar_one_or_none()


async def start_exam_attempt(
    db: AsyncSession,
    exam: Exam,
    candidate_id: uuid.UUID,
    now: datetime | None = None,
) -> ExamAttempt:
    if not exam.anti_cheat_enabled:
        raise HTTPException(status_code=400, detail="Exam does not require an attempt")

    now = now or _utc_now()
    exam_start = _as_utc(exam.start_time)
    exam_end = _as_utc(exam.end_time)
    if now < exam_start:
        raise HTTPException(status_code=403, detail="Exam has not started")
    if now > exam_end:
        raise HTTPException(status_code=403, detail="Exam has finished")

    existing = await get_exam_attempt(db, exam.exam_id, candidate_id)
    if existing is not None:
        if existing.status != "in_progress" or _is_attempt_expired(existing, now):
            raise HTTPException(status_code=409, detail="Exam attempt cannot be restarted")
        return existing

    attempt = ExamAttempt(
        exam_id=exam.exam_id,
        candidate_id=candidate_id,
        started_at=now,
        deadline_at=_attempt_deadline(exam, now),
        status="in_progress",
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


async def end_exam_attempt(
    db: AsyncSession,
    exam_id: uuid.UUID,
    candidate_id: uuid.UUID,
    now: datetime | None = None,
) -> ExamAttempt:
    attempt = await get_exam_attempt(db, exam_id, candidate_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    if attempt.status != "in_progress":
        return attempt

    attempt.status = "ended"
    attempt.ended_at = now or _utc_now()
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


async def register_fullscreen_exit(
    db: AsyncSession,
    exam: Exam,
    candidate_id: uuid.UUID,
    now: datetime | None = None,
) -> ExamAttempt:
    if not exam.anti_cheat_enabled:
        raise HTTPException(status_code=400, detail="Exam does not use anti-cheat")

    now = now or _utc_now()
    attempt = await get_exam_attempt(db, exam.exam_id, candidate_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Exam attempt not found")

    attempt = await _force_end_attempt_if_needed(db, attempt, now)
    if attempt.status != "in_progress" or _is_attempt_expired(attempt, now):
        raise HTTPException(status_code=409, detail="Exam attempt is not active")

    if attempt.force_end_at is None:
        attempt.fullscreen_exit_started_at = now
        attempt.force_end_at = now + timedelta(seconds=FULLSCREEN_EXIT_GRACE_SECONDS)
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)
    return attempt


async def register_fullscreen_return(
    db: AsyncSession,
    exam: Exam,
    candidate_id: uuid.UUID,
    now: datetime | None = None,
) -> ExamAttempt:
    if not exam.anti_cheat_enabled:
        raise HTTPException(status_code=400, detail="Exam does not use anti-cheat")

    now = now or _utc_now()
    attempt = await get_exam_attempt(db, exam.exam_id, candidate_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Exam attempt not found")

    attempt = await _force_end_attempt_if_needed(db, attempt, now)
    if attempt.status != "in_progress":
        return attempt

    if attempt.force_end_at is not None and now <= _as_utc(attempt.force_end_at):
        attempt.fullscreen_exit_started_at = None
        attempt.force_end_at = None
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)
    return attempt


async def get_exam_access(
    db: AsyncSession,
    exam: Exam,
    candidate_id: uuid.UUID,
    role: str,
    now: datetime | None = None,
) -> ExamAccess:
    now = now or _utc_now()
    if role != "candidate":
        return ExamAccess(
            exam_id=exam.exam_id,
            status_label="staff",
            can_view_exam=True,
            can_view_problems=True,
            can_start=False,
            can_solve=False,
            can_submit=False,
            can_edit_submission=False,
            can_view_submissions=True,
            requires_fullscreen=False,
            attempt_started_at=None,
            attempt_deadline_at=None,
            attempt_ended_at=None,
        )

    if exam.anti_cheat_enabled:
        exam_start = _as_utc(exam.start_time)
        exam_end = _as_utc(exam.end_time)
        attempt = await get_exam_attempt(db, exam.exam_id, candidate_id)
        if attempt is None:
            can_start = exam_start <= now <= exam_end
            if now < exam_start:
                status_label = "not_started"
            elif now > exam_end:
                status_label = "finished"
            else:
                status_label = "can_start"
            return ExamAccess(
                exam_id=exam.exam_id,
                status_label=status_label,
                can_view_exam=True,
                can_view_problems=now > exam_end,
                can_start=can_start,
                can_solve=False,
                can_submit=False,
                can_edit_submission=False,
                can_view_submissions=True,
                requires_fullscreen=True,
                attempt_started_at=None,
                attempt_deadline_at=None,
                attempt_ended_at=None,
            )

        attempt = await _force_end_attempt_if_needed(db, attempt, now)
        attempt_deadline = _as_utc(attempt.deadline_at)
        is_active = (
            attempt.status == "in_progress"
            and now <= attempt_deadline
            and (attempt.force_end_at is None or now <= _as_utc(attempt.force_end_at))
        )
        if is_active:
            status_label = "in_progress"
        elif _is_attempt_expired(attempt, now):
            status_label = "expired"
        else:
            status_label = attempt.status
        return ExamAccess(
            exam_id=exam.exam_id,
            status_label=status_label,
            can_view_exam=True,
            can_view_problems=True,
            can_start=False,
            can_solve=is_active,
            can_submit=is_active,
            can_edit_submission=is_active,
            can_view_submissions=True,
            requires_fullscreen=is_active,
            attempt_started_at=attempt.started_at,
            attempt_deadline_at=attempt.deadline_at,
            attempt_ended_at=attempt.ended_at,
        )

    exam_start = _as_utc(exam.start_time)
    exam_end = _as_utc(exam.end_time)
    is_in_window = exam_start <= now <= exam_end
    return ExamAccess(
        exam_id=exam.exam_id,
        status_label="in_progress" if is_in_window else "not_started"
        if now < exam_start
        else "finished",
        can_view_exam=True,
        can_view_problems=now >= exam_start,
        can_start=False,
        can_solve=is_in_window,
        can_submit=is_in_window,
        can_edit_submission=is_in_window,
        can_view_submissions=True,
        requires_fullscreen=False,
        attempt_started_at=None,
        attempt_deadline_at=None,
        attempt_ended_at=None,
    )


async def list_exam_problems_for_user(
    db: AsyncSession, exam_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> list[ExamProblemRow]:
    if role == "candidate":
        exam = await get_exam(db, exam_id)
        access = await get_exam_access(db, exam, user_id, role)
        if not access.can_view_problems:
            raise HTTPException(status_code=403, detail="Exam problems are not available")
        await proctoring_service.ensure_candidate_not_locked(db, exam_id, user_id)

    stmt = (
        select(ExamAssignment, Problem)
        .join(Problem, ExamAssignment.problem_id == Problem.problem_id)
        .where(ExamAssignment.exam_id == exam_id)
        .order_by(ExamAssignment.created_at)
    )
    if role == "candidate":
        stmt = stmt.where(ExamAssignment.candidate_id == user_id)
    result = await db.execute(stmt)
    rows = []
    for assignment, problem in result.all():
        rows.append(ExamProblemRow(
            assignment_id=assignment.assignment_id,
            problem_id=problem.problem_id,
            title=problem.title,
            description=problem.description,
            input_format=problem.input_format,
            output_format=problem.output_format,
            sample_input=problem.sample_input,
            sample_output=problem.sample_output,
            difficulty=problem.difficulty,
            time_limit=problem.time_limit,
            memory_limit=problem.memory_limit,
            allowed_langs=problem.allowed_langs,
        ))
    return rows


async def list_assignments(db: AsyncSession, exam_id: uuid.UUID) -> list[ExamAssignment]:
    result = await db.execute(
        select(ExamAssignment)
        .where(ExamAssignment.exam_id == exam_id)
        .order_by(ExamAssignment.created_at)
    )
    return list(result.scalars())


async def create_assignment(
    db: AsyncSession, exam_id: uuid.UUID, data: ExamAssignmentCreate
) -> ExamAssignment:
    assignment = ExamAssignment(
        exam_id=exam_id,
        candidate_id=data.candidate_id,
        problem_id=data.problem_id,
        assigned_difficulty=data.assigned_difficulty,
    )
    db.add(assignment)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Assignment already exists")
    await db.refresh(assignment)
    return assignment


async def delete_assignment(
    db: AsyncSession, exam_id: uuid.UUID, assignment_id: uuid.UUID
) -> None:
    assignment = await db.get(ExamAssignment, assignment_id)
    if assignment is None or assignment.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(assignment)
    await db.commit()
