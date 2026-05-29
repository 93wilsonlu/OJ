import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.exam import Exam
from app.models.user import User
from app.schemas.exam import (
    ExamAssignmentCreate,
    ExamAssignmentOut,
    ExamCreate,
    ExamOut,
    ExamProblemOut,
    ExamUpdate,
)
from app.services import exam as exam_service
from app.services.auth import require_role

router = APIRouter(prefix="/exams", tags=["exams"])

_WRITE_ROLES = ("interviewer", "admin")


async def get_scoped_exam(
    exam_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Exam:
    """Resolve an exam with candidate-assignment scope enforced (H2 IDOR guard)."""
    return await exam_service.get_exam_for_user(
        db, exam_id, current_user.user_id, current_user.role
    )


@router.get("", response_model=list[ExamOut])
async def list_exams(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exams = await exam_service.list_exams(db, current_user.user_id, current_user.role)
    return [ExamOut.model_validate(e) for e in exams]


@router.post("", response_model=ExamOut, status_code=201)
async def create_exam(
    body: ExamCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    exam = await exam_service.create_exam(db, body, current_user.user_id)
    return ExamOut.model_validate(exam)


@router.get("/{exam_id}", response_model=ExamOut)
async def get_exam(
    exam: Exam = Depends(get_scoped_exam),
):
    return ExamOut.model_validate(exam)


@router.patch("/{exam_id}", response_model=ExamOut)
async def update_exam(
    exam_id: uuid.UUID,
    body: ExamUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    exam = await exam_service.get_exam(db, exam_id)
    exam = await exam_service.update_exam(db, exam, body)
    return ExamOut.model_validate(exam)


@router.delete("/{exam_id}", status_code=204)
async def delete_exam(
    exam_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    exam = await exam_service.get_exam(db, exam_id)
    await exam_service.delete_exam(db, exam)
    return Response(status_code=204)


@router.get("/{exam_id}/problems", response_model=list[ExamProblemOut])
async def list_exam_problems(
    exam: Exam = Depends(get_scoped_exam),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await exam_service.list_exam_problems_for_user(
        db, exam.exam_id, current_user.user_id, current_user.role
    )
    return [ExamProblemOut(**vars(item)) for item in items]


@router.get("/{exam_id}/assignments", response_model=list[ExamAssignmentOut])
async def list_assignments(
    exam_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    await exam_service.get_exam(db, exam_id)
    assignments = await exam_service.list_assignments(db, exam_id)
    return [ExamAssignmentOut.model_validate(a) for a in assignments]


@router.post("/{exam_id}/assignments", response_model=ExamAssignmentOut, status_code=201)
async def create_assignment(
    exam_id: uuid.UUID,
    body: ExamAssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    await exam_service.get_exam(db, exam_id)
    assignment = await exam_service.create_assignment(db, exam_id, body)
    return ExamAssignmentOut.model_validate(assignment)


@router.delete("/{exam_id}/assignments/{assignment_id}", status_code=204)
async def delete_assignment(
    exam_id: uuid.UUID,
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    await exam_service.delete_assignment(db, assignment_id)
    return Response(status_code=204)
