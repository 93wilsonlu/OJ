import uuid

from fastapi import APIRouter, Depends, Form, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.problem import ProblemCreate, ProblemOut, ProblemUpdate, TestCaseOut
from app.services import problem as problem_service
from app.services.auth import require_role

router = APIRouter(prefix="/problems", tags=["problems"])

_WRITE_ROLES = ("problem_admin", "admin")


@router.get("", response_model=list[ProblemOut])
async def list_problems(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    problems = await problem_service.list_problems(db)
    return [ProblemOut.model_validate(p) for p in problems]


@router.post("", response_model=ProblemOut, status_code=201)
async def create_problem(
    body: ProblemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    problem = await problem_service.create_problem(db, body, current_user.user_id)
    return ProblemOut.model_validate(problem)


@router.get("/{problem_id}", response_model=ProblemOut)
async def get_problem(
    problem_id: uuid.UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    problem = await problem_service.get_problem(db, problem_id)
    return ProblemOut.model_validate(problem)


@router.patch("/{problem_id}", response_model=ProblemOut)
async def update_problem(
    problem_id: uuid.UUID,
    body: ProblemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    problem = await problem_service.get_problem(db, problem_id)
    problem = await problem_service.update_problem(db, problem, body)
    return ProblemOut.model_validate(problem)


@router.delete("/{problem_id}", status_code=204)
async def delete_problem(
    problem_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    problem = await problem_service.get_problem(db, problem_id)
    await problem_service.delete_problem(db, problem)
    return Response(status_code=204)


@router.get("/{problem_id}/test-cases", response_model=list[TestCaseOut])
async def list_test_cases(
    problem_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await problem_service.get_problem(db, problem_id)  # 404 if problem missing
    include_hidden = current_user.role in _WRITE_ROLES
    tcs = await problem_service.list_test_cases(db, problem_id, include_hidden)
    return [TestCaseOut.model_validate(tc) for tc in tcs]


@router.post("/{problem_id}/test-cases", response_model=TestCaseOut, status_code=201)
async def create_test_case(
    problem_id: uuid.UUID,
    input_file: UploadFile,
    expected_file: UploadFile,
    is_hidden: bool = Form(True),
    score_weight: float = Form(1.0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    await problem_service.get_problem(db, problem_id)  # 404 if problem missing
    input_bytes = await input_file.read()
    expected_bytes = await expected_file.read()
    tc = await problem_service.create_test_case(
        db, problem_id, input_bytes, expected_bytes, is_hidden, score_weight
    )
    return TestCaseOut.model_validate(tc)


@router.delete("/{problem_id}/test-cases/{testcase_id}", status_code=204)
async def delete_test_case(
    problem_id: uuid.UUID,
    testcase_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, *_WRITE_ROLES)
    tc = await problem_service.get_test_case(db, problem_id, testcase_id)
    await problem_service.delete_test_case(db, tc)
    return Response(status_code=204)
