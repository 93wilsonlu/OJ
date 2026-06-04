"""
Exam service unit tests + router integration tests.
No Postgres required — DB session is fully mocked.
"""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.exam_assignment import ExamAssignment
from app.models.exam_candidate_state import ExamCandidateState
from app.schemas.exam import ExamAssignmentCreate, ExamCreate, ExamUpdate
from app.services import proctoring
from app.services.exam import (
    create_assignment,
    create_exam,
    delete_assignment,
    delete_exam,
    end_exam_attempt,
    get_exam,
    get_exam_access,
    get_exam_for_user,
    get_owned_exam,
    list_exam_problems_for_user,
    list_exams,
    register_fullscreen_exit,
    register_fullscreen_return,
    start_exam_attempt,
    update_exam,
)
from tests.factories import (
    clear_overrides as _clear_overrides,
)
from tests.factories import (
    client_for as _client_for,
)
from tests.factories import (
    make_attempt as _make_attempt,
)
from tests.factories import (
    make_exam as _make_exam,
)
from tests.factories import (
    make_problem as _make_problem,
)
from tests.factories import (
    make_user as _make_user,
)
from tests.factories import (
    mock_db as _mock_db,
)

# ── service: list / get ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_exams_returns_all_for_interviewer():
    exams = [_make_exam("A"), _make_exam("B")]
    db = _mock_db(exams)
    result = await list_exams(db, uuid.uuid4(), "interviewer")
    assert result == exams


@pytest.mark.asyncio
async def test_get_exam_not_found_raises_404():
    db = _mock_db()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await get_exam(db, uuid.uuid4())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_exam_found():
    exam = _make_exam()
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    result = await get_exam(db, exam.exam_id)
    assert result is exam


# ── service: candidate-scoped get (H2 IDOR) ────────────────────────────────────

@pytest.mark.asyncio
async def test_get_exam_for_user_candidate_with_assignment_returns_exam():
    exam = _make_exam()
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    result_mock = MagicMock()
    result_mock.first.return_value = (uuid.uuid4(),)  # assignment row exists
    db.execute = AsyncMock(return_value=result_mock)

    result = await get_exam_for_user(db, exam.exam_id, uuid.uuid4(), "candidate")
    assert result is exam


@pytest.mark.asyncio
async def test_get_exam_for_user_candidate_without_assignment_raises_404():
    exam = _make_exam()
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    result_mock = MagicMock()
    result_mock.first.return_value = None  # no assignment
    db.execute = AsyncMock(return_value=result_mock)

    with pytest.raises(HTTPException) as exc:
        await get_exam_for_user(db, exam.exam_id, uuid.uuid4(), "candidate")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_exam_for_user_interviewer_skips_assignment_check():
    exam = _make_exam()
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    db.execute = AsyncMock()

    result = await get_exam_for_user(db, exam.exam_id, uuid.uuid4(), "interviewer")
    assert result is exam
    db.execute.assert_not_awaited()  # no assignment lookup for staff


@pytest.mark.asyncio
async def test_get_exam_for_user_missing_exam_raises_404():
    db = _mock_db()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await get_exam_for_user(db, uuid.uuid4(), uuid.uuid4(), "candidate")
    assert exc.value.status_code == 404


# ── service: create / update ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_exam_commits_and_returns():
    db = _mock_db()
    creator_id = uuid.uuid4()
    data = ExamCreate(
        title="Sprint 1",
        start_time=datetime.now(UTC),
        end_time=datetime.now(UTC) + timedelta(hours=1),
    )
    exam = await create_exam(db, data, creator_id)
    db.add.assert_called_once()
    db.commit.assert_awaited_once()
    assert exam.title == "Sprint 1"
    assert exam.created_by == creator_id


@pytest.mark.asyncio
async def test_create_anti_cheat_exam_sets_test_time():
    db = _mock_db()
    creator_id = uuid.uuid4()
    data = ExamCreate(
        title="Proctored",
        start_time=datetime.now(UTC),
        end_time=datetime.now(UTC) + timedelta(hours=1),
        anti_cheat_enabled=True,
        test_time_minutes=45,
    )
    exam = await create_exam(db, data, creator_id)
    assert exam.anti_cheat_enabled is True
    assert exam.test_time_minutes == 45


@pytest.mark.asyncio
async def test_update_exam_applies_fields():
    exam = _make_exam("Old Title")
    db = _mock_db()
    db.refresh = AsyncMock(side_effect=lambda obj: None)
    updated = await update_exam(db, exam, ExamUpdate(title="New Title"))
    assert updated.title == "New Title"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_exam_rejects_anti_cheat_without_test_time():
    exam = _make_exam()
    db = _mock_db()
    with pytest.raises(HTTPException) as exc:
        await update_exam(db, exam, ExamUpdate(anti_cheat_enabled=True))
    assert exc.value.status_code == 422
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_exam_commits():
    exam = _make_exam()
    db = _mock_db()
    await delete_exam(db, exam)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_exam_deletes_dependents_in_fk_order():
    """I1: exams with submissions/assignments must not 500. Deps have no DB
    cascade and the models declare no relationship(), so the unit-of-work can't
    order the deletes — we must emit explicit DELETEs in FK order
    (judge_results → submissions → assignments → exam) ourselves."""
    exam = _make_exam()
    db = _mock_db()

    await delete_exam(db, exam)

    # Each delete() statement targets one table; assert they were issued in the
    # order children-before-parents so the FK constraint never trips.
    tables = [
        call.args[0].table.name for call in db.execute.await_args_list
    ]
    assert tables == [
        "judge_results",
        "submissions",
        "exam_candidate_states",
        "exam_attempts",
        "exam_assignments",
        "exams",
    ]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_start_exam_attempt_creates_attempt_with_clamped_deadline():
    now = datetime.now(UTC)
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=180)
    exam.start_time = now - timedelta(minutes=1)
    exam.end_time = now + timedelta(minutes=30)
    candidate_id = uuid.uuid4()
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    attempt = await start_exam_attempt(db, exam, candidate_id, now)

    assert attempt.exam_id == exam.exam_id
    assert attempt.candidate_id == candidate_id
    assert attempt.started_at == now
    assert attempt.deadline_at == exam.end_time
    db.add.assert_called_once_with(attempt)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_start_exam_attempt_returns_existing_active_attempt():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(
        exam.exam_id,
        candidate_id,
        deadline_at=now + timedelta(minutes=10),
    )
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    result = await start_exam_attempt(db, exam, candidate_id, now)

    assert result is attempt
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_start_exam_attempt_rejects_restart_after_end():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(exam.exam_id, candidate_id, status="ended")
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    with pytest.raises(HTTPException) as exc:
        await start_exam_attempt(db, exam, candidate_id, now)

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_end_exam_attempt_marks_attempt_ended():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(exam.exam_id, candidate_id)
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    ended = await end_exam_attempt(db, exam.exam_id, candidate_id, now)

    assert ended.status == "ended"
    assert ended.ended_at == now
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_fullscreen_exit_sets_force_end_deadline():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(
        exam.exam_id,
        candidate_id,
        deadline_at=now + timedelta(minutes=10),
    )
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    updated = await register_fullscreen_exit(db, exam, candidate_id, now)

    assert updated.fullscreen_exit_started_at == now
    assert updated.force_end_at == now + timedelta(seconds=5)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_fullscreen_return_before_grace_clears_warning():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(
        exam.exam_id,
        candidate_id,
        deadline_at=now + timedelta(minutes=10),
    )
    attempt.fullscreen_exit_started_at = now - timedelta(seconds=3)
    attempt.force_end_at = now + timedelta(seconds=2)
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    updated = await register_fullscreen_return(db, exam, candidate_id, now)

    assert updated.status == "in_progress"
    assert updated.fullscreen_exit_started_at is None
    assert updated.force_end_at is None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_fullscreen_return_after_grace_force_ends_attempt():
    force_end_at = datetime.now(UTC) - timedelta(seconds=1)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(
        exam.exam_id,
        candidate_id,
        deadline_at=force_end_at + timedelta(minutes=10),
    )
    attempt.fullscreen_exit_started_at = force_end_at - timedelta(seconds=5)
    attempt.force_end_at = force_end_at
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    updated = await register_fullscreen_return(
        db, exam, candidate_id, force_end_at + timedelta(seconds=1)
    )

    assert updated.status == "force_ended"
    assert updated.ended_at == force_end_at
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_exam_access_for_anti_cheat_before_attempt_can_start():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    exam.start_time = now - timedelta(minutes=1)
    exam.end_time = now + timedelta(hours=1)
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    access = await get_exam_access(db, exam, candidate_id, "candidate", now)

    assert access.status_label == "can_start"
    assert access.can_start is True
    assert access.can_view_problems is False
    assert access.can_submit is False


@pytest.mark.asyncio
async def test_exam_access_for_active_attempt_can_solve():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(
        exam.exam_id,
        candidate_id,
        deadline_at=now + timedelta(minutes=10),
    )
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    access = await get_exam_access(db, exam, candidate_id, "candidate", now)

    assert access.status_label == "in_progress"
    assert access.can_view_problems is True
    assert access.can_submit is True
    assert access.requires_fullscreen is True


@pytest.mark.asyncio
async def test_exam_access_for_expired_attempt_is_readonly():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(
        exam.exam_id,
        candidate_id,
        deadline_at=now - timedelta(seconds=1),
    )
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    access = await get_exam_access(db, exam, candidate_id, "candidate", now)

    assert access.status_label == "expired"
    assert access.can_view_problems is True
    assert access.can_submit is False
    assert access.can_edit_submission is False


@pytest.mark.asyncio
async def test_exam_access_force_ends_attempt_after_fullscreen_grace():
    force_end_at = datetime.now(UTC) - timedelta(seconds=1)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    attempt = _make_attempt(
        exam.exam_id,
        candidate_id,
        deadline_at=force_end_at + timedelta(minutes=10),
    )
    attempt.fullscreen_exit_started_at = force_end_at - timedelta(seconds=5)
    attempt.force_end_at = force_end_at
    db = _mock_db()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = attempt
    db.execute = AsyncMock(return_value=result_mock)

    access = await get_exam_access(
        db, exam, candidate_id, "candidate", force_end_at + timedelta(seconds=1)
    )

    assert access.status_label == "force_ended"
    assert access.can_view_problems is True
    assert access.can_submit is False
    assert attempt.ended_at == force_end_at
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_exam_problems_anti_cheat_without_attempt_before_end_raises_403():
    now = datetime.now(UTC)
    candidate_id = uuid.uuid4()
    exam = _make_exam(anti_cheat_enabled=True, test_time_minutes=30)
    exam.start_time = now - timedelta(minutes=1)
    exam.end_time = now + timedelta(hours=1)

    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    no_attempt_result = MagicMock()
    no_attempt_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=no_attempt_result)

    with pytest.raises(HTTPException) as exc:
        await list_exam_problems_for_user(db, exam.exam_id, candidate_id, "candidate")

    assert exc.value.status_code == 403
    assert "problems" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_list_exam_problems_anti_cheat_after_end_is_readonly_visible():
    candidate_id = uuid.uuid4()
    problem = _make_problem()
    exam = _make_exam(ended=True, anti_cheat_enabled=True, test_time_minutes=30)
    assignment = ExamAssignment()
    assignment.assignment_id = uuid.uuid4()
    assignment.exam_id = exam.exam_id
    assignment.candidate_id = candidate_id
    assignment.problem_id = problem.problem_id
    assignment.assigned_difficulty = None

    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    no_attempt_result = MagicMock()
    no_attempt_result.scalar_one_or_none.return_value = None
    no_state_result = MagicMock()
    no_state_result.scalar_one_or_none.return_value = None
    rows_result = MagicMock()
    rows_result.all.return_value = [(assignment, problem)]
    db.execute = AsyncMock(
        side_effect=[no_attempt_result, no_state_result, rows_result]
    )

    rows = await list_exam_problems_for_user(
        db, exam.exam_id, candidate_id, "candidate"
    )

    assert len(rows) == 1
    assert rows[0].problem_id == problem.problem_id


@pytest.mark.asyncio
async def test_proctoring_event_locks_after_warning_threshold():
    state = ExamCandidateState()
    state.exam_id = uuid.uuid4()
    state.candidate_id = uuid.uuid4()
    state.status = "active"
    state.warning_started_at = datetime.now(UTC) - timedelta(seconds=11)
    state.locked_at = None
    state.lock_reason = None
    state.last_event_type = "fullscreen_lost"
    state.last_seen_at = datetime.now(UTC) - timedelta(seconds=11)

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = state
    db = _mock_db()
    db.execute = AsyncMock(return_value=result_mock)

    locked = await proctoring.register_event(
        db,
        state.exam_id,
        state.candidate_id,
        "warning_timeout",
        True,
    )

    assert locked.status == "locked"
    assert locked.lock_reason == "warning_timeout"
    assert locked.locked_at is not None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_proctoring_restored_before_threshold_clears_warning():
    state = ExamCandidateState()
    state.exam_id = uuid.uuid4()
    state.candidate_id = uuid.uuid4()
    state.status = "active"
    state.warning_started_at = datetime.now(UTC) - timedelta(seconds=3)
    state.locked_at = None
    state.lock_reason = None
    state.last_event_type = "fullscreen_lost"
    state.last_seen_at = datetime.now(UTC) - timedelta(seconds=3)

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = state
    db = _mock_db()
    db.execute = AsyncMock(return_value=result_mock)

    restored = await proctoring.register_event(
        db,
        state.exam_id,
        state.candidate_id,
        "fullscreen_restored",
        False,
    )

    assert restored.status == "active"
    assert restored.warning_started_at is None
    assert restored.locked_at is None


@pytest.mark.asyncio
async def test_locked_candidate_check_raises_403():
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = "locked"
    db = _mock_db()
    db.execute = AsyncMock(return_value=result_mock)

    with pytest.raises(HTTPException) as exc:
        await proctoring.ensure_candidate_not_locked(db, uuid.uuid4(), uuid.uuid4())

    assert exc.value.status_code == 403
    assert "proctoring" in exc.value.detail.lower()


# ── service: assignment ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_assignment_commits_and_returns():
    db = _mock_db()
    exam_id = uuid.uuid4()
    data = ExamAssignmentCreate(
        candidate_id=uuid.uuid4(),
        problem_id=uuid.uuid4(),
    )
    assignment = await create_assignment(db, exam_id, data)
    db.add.assert_called_once()
    db.commit.assert_awaited_once()
    assert assignment.exam_id == exam_id
    assert assignment.candidate_id == data.candidate_id


@pytest.mark.asyncio
async def test_delete_assignment_in_exam_commits():
    exam_id = uuid.uuid4()
    assignment = ExamAssignment()
    assignment.assignment_id = uuid.uuid4()
    assignment.exam_id = exam_id

    db = _mock_db()
    db.get = AsyncMock(return_value=assignment)

    await delete_assignment(db, exam_id, assignment.assignment_id)
    db.delete.assert_awaited_once_with(assignment)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_assignment_wrong_exam_raises_404():
    """IDOR: an assignment belonging to a different exam must not be deletable
    through another exam's path, and must 404 (not leak existence)."""
    assignment = ExamAssignment()
    assignment.assignment_id = uuid.uuid4()
    assignment.exam_id = uuid.uuid4()  # belongs to some other exam

    db = _mock_db()
    db.get = AsyncMock(return_value=assignment)

    with pytest.raises(HTTPException) as exc:
        await delete_assignment(db, uuid.uuid4(), assignment.assignment_id)
    assert exc.value.status_code == 404
    db.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_assignment_missing_raises_404():
    db = _mock_db()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await delete_assignment(db, uuid.uuid4(), uuid.uuid4())
    assert exc.value.status_code == 404


# ── router integration ─────────────────────────────────────────────────────────

@patch("app.routers.exam.exam_service.create_exam", new_callable=AsyncMock)
def test_candidate_gets_403_on_create_exam(mock_create):
    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        resp = client.post(
            "/api/v1/exams",
            json={
                "title": "X",
                "start_time": datetime.now(UTC).isoformat(),
                "end_time": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            },
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 403
    mock_create.assert_not_called()


@patch("app.routers.exam.exam_service.list_exam_problems_for_user", new_callable=AsyncMock)
@patch("app.routers.exam.exam_service.get_exam_for_user", new_callable=AsyncMock)
def test_candidate_unassigned_gets_404_on_exam_problems(mock_scoped, mock_list_problems):
    """H2 IDOR: unassigned candidate is 404'd by the scoped-exam dependency."""
    mock_scoped.side_effect = HTTPException(status_code=404, detail="Exam not found")
    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        resp = client.get(f"/api/v1/exams/{uuid.uuid4()}/problems")
    finally:
        _clear_overrides()

    assert resp.status_code == 404
    mock_list_problems.assert_not_called()


@patch("app.routers.exam.exam_service.get_exam_for_user", new_callable=AsyncMock)
def test_candidate_unassigned_gets_404_on_get_exam(mock_scoped):
    """H2 IDOR: unassigned candidate can't read exam metadata by UUID."""
    mock_scoped.side_effect = HTTPException(status_code=404, detail="Exam not found")
    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        resp = client.get(f"/api/v1/exams/{uuid.uuid4()}")
    finally:
        _clear_overrides()

    assert resp.status_code == 404


@patch("app.routers.exam.exam_service.list_exams", new_callable=AsyncMock)
def test_list_exams_returns_200(mock_list):
    exam = _make_exam()
    mock_list.return_value = [exam]
    interviewer = _make_user("interviewer")
    client = _client_for(interviewer)
    try:
        resp = client.get("/api/v1/exams")
    finally:
        _clear_overrides()

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == exam.title


# ── schema: end_time must be after start_time (I2) ─────────────────────────────

def test_exam_create_rejects_end_before_start():
    now = datetime.now(UTC)
    with pytest.raises(ValueError):
        ExamCreate(title="T", start_time=now, end_time=now - timedelta(hours=1))


# ── service: owner-or-admin write scope (I5) ───────────────────────────────────

@pytest.mark.asyncio
async def test_get_owned_exam_allows_owner():
    exam = _make_exam()
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    result = await get_owned_exam(db, exam.exam_id, exam.created_by, "interviewer")
    assert result is exam


@pytest.mark.asyncio
async def test_get_owned_exam_blocks_non_owner():
    exam = _make_exam()
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    with pytest.raises(HTTPException) as exc:
        await get_owned_exam(db, exam.exam_id, uuid.uuid4(), "interviewer")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_owned_exam_allows_admin():
    exam = _make_exam()
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    result = await get_owned_exam(db, exam.exam_id, uuid.uuid4(), "admin")
    assert result is exam
