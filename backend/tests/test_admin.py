"""
Admin user-management service tests + router RBAC coverage.
DB session is mocked; no Postgres required.
"""
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import get_db
from app.deps import get_current_user
from app.main import app
from app.models.user import User
from app.models.exam import Exam
from app.models.exam_assignment import ExamAssignment
from app.models.judge_result import JudgeResult
from app.models.problem import Problem
from app.models.submission import Submission
from app.schemas.admin import AdminUserCreate, AdminUserUpdate
from app.schemas.admin import AdminUserOut
from sqlalchemy.exc import IntegrityError

from app.services.admin import (
    create_user,
    deactivate_user,
    delete_user,
    get_exam_results,
    update_user,
)
from app.services.auth import hash_password


def _make_user(role: str = "admin") -> User:
    user = User()
    user.user_id = uuid.uuid4()
    user.name = "Test User"
    user.email = f"{role}-{user.user_id}@example.com"
    user.password_hash = hash_password("secret123")
    user.role = role
    user.is_active = True
    user.created_at = datetime.now(UTC)
    user.updated_at = datetime.now(UTC)
    return user


def _mock_db() -> MagicMock:
    db = MagicMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    db.get = AsyncMock(return_value=None)
    return db


def _make_exam() -> Exam:
    exam = Exam()
    exam.exam_id = uuid.uuid4()
    exam.title = "Backend Interview"
    exam.description = None
    exam.start_time = datetime.now(UTC)
    exam.end_time = datetime.now(UTC)
    exam.show_score = True
    exam.created_by = uuid.uuid4()
    exam.created_at = datetime.now(UTC)
    return exam


def _make_problem(title: str = "Two Sum") -> Problem:
    problem = Problem()
    problem.problem_id = uuid.uuid4()
    problem.title = title
    problem.description = ""
    problem.input_format = None
    problem.output_format = None
    problem.sample_input = None
    problem.sample_output = None
    problem.difficulty = "easy"
    problem.time_limit = 1000
    problem.memory_limit = 128
    problem.allowed_langs = ["python3"]
    problem.created_by = uuid.uuid4()
    problem.created_at = datetime.now(UTC)
    return problem


def _make_assignment(exam: Exam, candidate: User, problem: Problem) -> ExamAssignment:
    assignment = ExamAssignment()
    assignment.assignment_id = uuid.uuid4()
    assignment.exam_id = exam.exam_id
    assignment.candidate_id = candidate.user_id
    assignment.problem_id = problem.problem_id
    assignment.assigned_difficulty = None
    assignment.created_at = datetime.now(UTC)
    return assignment


def _make_submission(exam: Exam, candidate: User, problem: Problem) -> Submission:
    submission = Submission()
    submission.submission_id = uuid.uuid4()
    submission.exam_id = exam.exam_id
    submission.candidate_id = candidate.user_id
    submission.problem_id = problem.problem_id
    submission.language = "python3"
    submission.code_storage_key = "submissions/code.py"
    submission.status = "completed"
    submission.ip_address = "127.0.0.1"
    submission.submitted_at = datetime.now(UTC)
    return submission


def _make_judge_result(submission: Submission, score: float, verdict: str) -> JudgeResult:
    result = JudgeResult()
    result.result_id = uuid.uuid4()
    result.submission_id = submission.submission_id
    result.verdict = verdict
    result.score = score
    result.passed_count = 1
    result.total_count = 1
    result.execution_time = 10
    result.memory_usage = 8
    result.error_message = None
    result.log_storage_key = None
    result.judged_at = datetime.now(UTC)
    return result


@pytest.mark.asyncio
async def test_interviewer_can_only_create_candidates():
    interviewer = _make_user("interviewer")
    db = _mock_db()

    with pytest.raises(HTTPException) as exc:
        await create_user(
            db,
            interviewer,
            AdminUserCreate(
                name="Privileged",
                email="privileged@example.com",
                password="password123",
                role="admin",
            ),
        )

    assert exc.value.status_code == 403
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_interviewer_can_create_candidate():
    interviewer = _make_user("interviewer")
    db = _mock_db()

    user = await create_user(
        db,
        interviewer,
        AdminUserCreate(
            name="Candidate",
            email="candidate@example.com",
            password="password123",
            role="candidate",
        ),
    )

    assert user.role == "candidate"
    assert user.is_active is True
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_cannot_change_own_role():
    admin = _make_user("admin")
    db = _mock_db()
    db.get = AsyncMock(return_value=admin)

    with pytest.raises(HTTPException) as exc:
        await update_user(
            db,
            admin,
            admin.user_id,
            AdminUserUpdate(role="candidate"),
        )

    assert exc.value.status_code == 403
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_cannot_deactivate_own_account():
    admin = _make_user("admin")
    db = _mock_db()
    db.get = AsyncMock(return_value=admin)

    with pytest.raises(HTTPException) as exc:
        await deactivate_user(db, admin, admin.user_id)

    assert exc.value.status_code == 403
    assert admin.is_active is True
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_can_deactivate_other_user():
    admin = _make_user("admin")
    candidate = _make_user("candidate")
    db = _mock_db()
    db.get = AsyncMock(return_value=candidate)

    await deactivate_user(db, admin, candidate.user_id)

    assert candidate.is_active is False
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_can_delete_other_user():
    admin = _make_user("admin")
    candidate = _make_user("candidate")
    db = _mock_db()
    db.get = AsyncMock(return_value=candidate)
    db.delete = AsyncMock()

    await delete_user(db, admin, candidate.user_id)

    db.delete.assert_awaited_once_with(candidate)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_cannot_delete_own_account():
    admin = _make_user("admin")
    db = _mock_db()
    db.get = AsyncMock(return_value=admin)
    db.delete = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await delete_user(db, admin, admin.user_id)

    assert exc.value.status_code == 403
    db.delete.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_user_with_existing_data_returns_409():
    admin = _make_user("admin")
    candidate = _make_user("candidate")
    db = _mock_db()
    db.get = AsyncMock(return_value=candidate)
    db.delete = AsyncMock()
    db.commit = AsyncMock(side_effect=IntegrityError("stmt", {}, Exception("fk")))

    with pytest.raises(HTTPException) as exc:
        await delete_user(db, admin, candidate.user_id)

    assert exc.value.status_code == 409
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_exam_results_uses_best_score_per_problem():
    interviewer = _make_user("interviewer")
    candidate = _make_user("candidate")
    exam = _make_exam()
    problem = _make_problem()
    assignment = _make_assignment(exam, candidate, problem)
    low_submission = _make_submission(exam, candidate, problem)
    high_submission = _make_submission(exam, candidate, problem)
    low_result = _make_judge_result(low_submission, 40, "Wrong Answer")
    high_result = _make_judge_result(high_submission, 100, "Accepted")

    rows = MagicMock()
    rows.all.return_value = [
        (assignment, candidate, problem, high_submission, high_result),
        (assignment, candidate, problem, low_submission, low_result),
    ]
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    db.execute = AsyncMock(return_value=rows)

    results = await get_exam_results(db, interviewer, exam.exam_id)

    assert results.exam_id == exam.exam_id
    assert len(results.candidates) == 1
    assert results.candidates[0].total_score == 100
    assert results.candidates[0].problems[0].best_score == 100
    assert results.candidates[0].problems[0].submission_count == 2
    assert results.candidates[0].problems[0].latest_verdict == "Accepted"


def _client_for(user: User):
    async def override_db():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def _clear_overrides():
    app.dependency_overrides.clear()


def test_non_admin_gets_403_on_user_list():
    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        response = client.get("/api/v1/admin/users")
    finally:
        _clear_overrides()

    assert response.status_code == 403


def test_admin_user_out_accepts_legacy_reserved_domain_email():
    user = _make_user("candidate")
    user.email = "alice.candidate@example.test"

    out = AdminUserOut.model_validate(user)

    assert out.email == "alice.candidate@example.test"
