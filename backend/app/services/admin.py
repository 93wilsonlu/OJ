import math
import uuid
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exam_assignment import ExamAssignment
from app.models.judge_result import JudgeResult
from app.models.problem import Problem
from app.models.submission import Submission
from app.models.user import User
from app.schemas.admin import AdminUserCreate, AdminUserUpdate
from app.services.auth import hash_password


@dataclass
class ExamProblemResult:
    problem_id: uuid.UUID
    title: str
    best_score: float | None = None
    submission_count: int = 0
    latest_verdict: str | None = None
    latest_submitted_at: datetime | None = None


@dataclass
class ExamCandidateResult:
    candidate_id: uuid.UUID
    name: str
    email: str
    problems: list[ExamProblemResult]
    total_score: float


@dataclass
class ExamResults:
    exam_id: uuid.UUID
    title: str
    candidates: list[ExamCandidateResult]


def _require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _require_exam_result_viewer(user: User) -> None:
    if user.role not in {"admin", "interviewer"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _require_user_creator(user: User, requested_role: str) -> None:
    if user.role == "admin":
        return
    if user.role == "interviewer" and requested_role == "candidate":
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions")


async def create_user(
    db: AsyncSession,
    current_user: User,
    data: AdminUserCreate,
) -> User:
    _require_user_creator(current_user, data.role)

    user = User(
        name=data.name.strip(),
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already exists")
    await db.refresh(user)
    return user


async def list_users(
    db: AsyncSession,
    current_user: User,
    *,
    role: str | None,
    name: str | None,
    page: int,
    page_size: int,
) -> tuple[list[User], int, int]:
    _require_admin(current_user)

    filters = []
    if role:
        filters.append(User.role == role)
    if name:
        pattern = f"%{name.strip()}%"
        filters.append(or_(User.name.ilike(pattern), User.email.ilike(pattern)))

    count_stmt = select(func.count()).select_from(User)
    query_stmt = select(User).order_by(User.created_at.desc(), User.email.asc())
    for condition in filters:
        count_stmt = count_stmt.where(condition)
        query_stmt = query_stmt.where(condition)

    total = int((await db.execute(count_stmt)).scalar_one())
    offset = (page - 1) * page_size
    rows = await db.execute(query_stmt.offset(offset).limit(page_size))
    total_pages = max(1, math.ceil(total / page_size))
    return list(rows.scalars()), total, total_pages


async def get_user(db: AsyncSession, current_user: User, user_id: uuid.UUID) -> User:
    _require_admin(current_user)
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def update_user(
    db: AsyncSession,
    current_user: User,
    user_id: uuid.UUID,
    data: AdminUserUpdate,
) -> User:
    _require_admin(current_user)
    user = await get_user(db, current_user, user_id)

    updates = data.model_dump(exclude_unset=True)
    if user.user_id == current_user.user_id and "role" in updates:
        raise HTTPException(status_code=403, detail="Cannot change your own role")

    for field, value in updates.items():
        if field == "name":
            setattr(user, field, value.strip())
        elif field == "password":
            setattr(user, "password_hash", hash_password(value))
        elif field == "is_active":
            if not value and user.user_id == current_user.user_id:
                raise HTTPException(status_code=403, detail="Cannot deactivate your own account")
            setattr(user, field, value)
        else:
            setattr(user, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already exists")
    await db.refresh(user)
    return user


async def delete_user(
    db: AsyncSession,
    current_user: User,
    user_id: uuid.UUID,
) -> None:
    _require_admin(current_user)
    user = await get_user(db, current_user, user_id)
    if user.user_id == current_user.user_id:
        raise HTTPException(status_code=403, detail="Cannot delete your own account")
    try:
        await db.delete(user)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Cannot delete user with existing data")


async def get_exam_results(
    db: AsyncSession,
    current_user: User,
    exam_id: uuid.UUID,
) -> ExamResults:
    _require_exam_result_viewer(current_user)

    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")

    stmt = (
        select(ExamAssignment, User, Problem, Submission, JudgeResult)
        .join(User, ExamAssignment.candidate_id == User.user_id)
        .join(Problem, ExamAssignment.problem_id == Problem.problem_id)
        .outerjoin(
            Submission,
            and_(
                Submission.exam_id == ExamAssignment.exam_id,
                Submission.candidate_id == ExamAssignment.candidate_id,
                Submission.problem_id == ExamAssignment.problem_id,
            ),
        )
        .outerjoin(JudgeResult, JudgeResult.submission_id == Submission.submission_id)
        .where(ExamAssignment.exam_id == exam_id)
        .order_by(
            User.name.asc(),
            User.email.asc(),
            Problem.title.asc(),
            Submission.submitted_at.desc(),
        )
    )
    rows = await db.execute(stmt)

    candidates: dict[uuid.UUID, dict] = {}
    for assignment, candidate, problem, submission, judge_result in rows.all():
        candidate_row = candidates.setdefault(
            candidate.user_id,
            {
                "candidate": candidate,
                "problems": {},
            },
        )
        problem_row = candidate_row["problems"].setdefault(
            assignment.problem_id,
            ExamProblemResult(
                problem_id=assignment.problem_id,
                title=problem.title,
            ),
        )

        if submission is None:
            continue

        problem_row.submission_count += 1
        if (
            problem_row.latest_submitted_at is None
            or submission.submitted_at > problem_row.latest_submitted_at
        ):
            problem_row.latest_submitted_at = submission.submitted_at
            problem_row.latest_verdict = judge_result.verdict if judge_result else submission.status

        if judge_result is not None:
            score = float(judge_result.score)
            if problem_row.best_score is None or score > problem_row.best_score:
                problem_row.best_score = score

    result_candidates: list[ExamCandidateResult] = []
    for candidate_row in candidates.values():
        candidate = candidate_row["candidate"]
        problems = list(candidate_row["problems"].values())
        total_score = sum(problem.best_score or 0 for problem in problems)
        result_candidates.append(
            ExamCandidateResult(
                candidate_id=candidate.user_id,
                name=candidate.name,
                email=candidate.email,
                problems=problems,
                total_score=total_score,
            )
        )

    return ExamResults(
        exam_id=exam.exam_id,
        title=exam.title,
        candidates=result_candidates,
    )
