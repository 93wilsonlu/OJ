"""
Admin user-management service tests + router RBAC coverage.
DB session is mocked; no Postgres required.
"""
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.models.judge_result import JudgeResult
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
from tests.factories import (
    client_for as _client_for,
    clear_overrides as _clear_overrides,
    make_assignment as _make_assignment,
    make_exam as _make_exam,
    make_problem as _make_problem,
    make_submission as _make_submission,
    make_user as _make_user,
    mock_db as _mock_db,
)


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
    assignment = _make_assignment(exam.exam_id, candidate.user_id, problem.problem_id)
    low_submission = _make_submission(candidate.user_id, exam.exam_id, problem.problem_id)
    high_submission = _make_submission(candidate.user_id, exam.exam_id, problem.problem_id)
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
