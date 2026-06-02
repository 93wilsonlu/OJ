"""
Admin user-management service tests + router RBAC coverage.
DB session is mocked; no Postgres required.
"""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.exam_candidate_state import ExamCandidateState
from app.models.judge_result import JudgeResult
from app.models.submission import Submission
from app.schemas.admin import AdminUserCreate, AdminUserOut, AdminUserUpdate
from app.services.admin import (
    create_user,
    deactivate_user,
    delete_user,
    get_exam_results,
    unlock_exam_candidate,
    update_user,
)
from tests.factories import (
    clear_overrides as _clear_overrides,
)
from tests.factories import (
    client_for as _client_for,
)
from tests.factories import (
    make_assignment as _make_assignment,
)
from tests.factories import (
    make_exam as _make_exam,
)
from tests.factories import (
    make_problem as _make_problem,
)
from tests.factories import (
    make_submission as _make_submission,
)
from tests.factories import (
    make_user as _make_user,
)
from tests.factories import (
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


def _make_candidate_state(
    exam_id: uuid.UUID,
    candidate_id: uuid.UUID,
    status: str = "locked",
) -> ExamCandidateState:
    state = ExamCandidateState()
    state.state_id = uuid.uuid4()
    state.exam_id = exam_id
    state.candidate_id = candidate_id
    state.status = status
    state.warning_started_at = datetime.now(UTC) - timedelta(seconds=12)
    state.locked_at = datetime.now(UTC) if status == "locked" else None
    state.lock_reason = "warning_timeout" if status == "locked" else None
    state.last_event_type = "warning_timeout"
    state.last_seen_at = datetime.now(UTC) - timedelta(seconds=1)
    state.created_at = datetime.now(UTC)
    return state


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
        (assignment, candidate, problem, high_submission, high_result, None),
        (assignment, candidate, problem, low_submission, low_result, None),
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
    assert results.candidates[0].is_active is True
    assert results.candidates[0].proctoring_status is None


@pytest.mark.asyncio
async def test_get_exam_results_exposes_candidate_account_and_lock_state():
    interviewer = _make_user("interviewer")
    candidate = _make_user("candidate")
    candidate.is_active = False
    exam = _make_exam()
    problem = _make_problem()
    assignment = _make_assignment(exam.exam_id, candidate.user_id, problem.problem_id)
    state = _make_candidate_state(exam.exam_id, candidate.user_id)

    rows = MagicMock()
    rows.all.return_value = [
        (assignment, candidate, problem, None, None, state),
    ]
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    db.execute = AsyncMock(return_value=rows)

    results = await get_exam_results(db, interviewer, exam.exam_id)

    result = results.candidates[0]
    assert result.is_active is False
    assert result.proctoring_status == "locked"
    assert result.locked_at == state.locked_at
    assert result.lock_reason == "warning_timeout"


@pytest.mark.asyncio
async def test_admin_can_unlock_exam_candidate():
    admin = _make_user("admin")
    exam_id = uuid.uuid4()
    candidate_id = uuid.uuid4()
    state = _make_candidate_state(exam_id, candidate_id)
    original_last_seen = state.last_seen_at

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = state
    db = _mock_db()
    db.execute = AsyncMock(return_value=result_mock)

    unlocked = await unlock_exam_candidate(db, admin, exam_id, candidate_id)

    assert unlocked.status == "active"
    assert unlocked.warning_started_at is None
    assert unlocked.locked_at is None
    assert unlocked.lock_reason is None
    assert unlocked.last_event_type is None
    assert unlocked.last_seen_at > original_last_seen
    db.add.assert_called_once_with(state)
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(state)


@pytest.mark.asyncio
async def test_interviewer_can_unlock_exam_candidate():
    interviewer = _make_user("interviewer")
    exam_id = uuid.uuid4()
    candidate_id = uuid.uuid4()
    state = _make_candidate_state(exam_id, candidate_id)

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = state
    db = _mock_db()
    db.execute = AsyncMock(return_value=result_mock)

    unlocked = await unlock_exam_candidate(db, interviewer, exam_id, candidate_id)

    assert unlocked.status == "active"
    db.commit.assert_awaited_once()


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
