import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import VALID_ROLES, User
from app.schemas.admin import (
    AdminUserCreate,
    AdminUserListOut,
    AdminUserOut,
    AdminUserUpdate,
    ExamCandidateResultOut,
    ExamProblemResultOut,
    ExamResultsOut,
)
from app.services import admin as admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/users", response_model=AdminUserOut, status_code=201)
async def create_user(
    body: AdminUserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await admin_service.create_user(db, current_user, body)
    return AdminUserOut.model_validate(user)


@router.get("/users", response_model=AdminUserListOut)
async def list_users(
    role: str | None = Query(default=None),
    name: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if role is not None and role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Invalid role")
    items, total, total_pages = await admin_service.list_users(
        db,
        current_user,
        role=role,
        name=name,
        page=page,
        page_size=page_size,
    )
    return AdminUserListOut(
        items=[AdminUserOut.model_validate(user) for user in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/users/{user_id}", response_model=AdminUserOut)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await admin_service.get_user(db, current_user, user_id)
    return AdminUserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await admin_service.update_user(db, current_user, user_id, body)
    return AdminUserOut.model_validate(user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await admin_service.delete_user(db, current_user, user_id)
    return Response(status_code=204)


@router.get("/exams/{exam_id}/results", response_model=ExamResultsOut)
async def get_exam_results(
    exam_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    results = await admin_service.get_exam_results(db, current_user, exam_id)
    return ExamResultsOut(
        exam_id=results.exam_id,
        title=results.title,
        candidates=[
            ExamCandidateResultOut(
                candidate_id=candidate.candidate_id,
                name=candidate.name,
                email=candidate.email,
                total_score=candidate.total_score,
                problems=[
                    ExamProblemResultOut(
                        problem_id=problem.problem_id,
                        title=problem.title,
                        best_score=problem.best_score,
                        submission_count=problem.submission_count,
                        latest_verdict=problem.latest_verdict,
                    )
                    for problem in candidate.problems
                ],
            )
            for candidate in results.candidates
        ],
    )
