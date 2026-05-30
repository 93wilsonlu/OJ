"""
Exam service unit tests + router integration tests.
No Postgres required — DB session is fully mocked.
"""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import get_db
from app.deps import get_current_user
from app.main import app
from app.models.exam import Exam
from app.models.exam_assignment import ExamAssignment
from app.models.user import User
from app.schemas.exam import ExamAssignmentCreate, ExamCreate, ExamUpdate
from app.services.auth import hash_password
from app.services.exam import (
    create_assignment,
    create_exam,
    delete_assignment,
    delete_exam,
    get_exam,
    get_exam_for_user,
    get_owned_exam,
    list_exams,
    update_exam,
)


# ── factories ─────────────────────────────────────────────────────────────────

def _make_user(role: str = "interviewer") -> User:
    u = User()
    u.user_id = uuid.uuid4()
    u.name = "Test"
    u.email = "test@example.com"
    u.password_hash = hash_password("secret")
    u.role = role
    return u


def _make_exam(title: str = "Test Exam") -> Exam:
    e = Exam()
    e.exam_id = uuid.uuid4()
    e.title = title
    e.description = None
    e.start_time = datetime.now(UTC)
    e.end_time = datetime.now(UTC) + timedelta(hours=2)
    e.show_score = False
    e.created_by = uuid.uuid4()
    e.created_at = datetime.now(UTC)
    return e


def _mock_db(rows=None):
    mock_result = MagicMock()
    mock_result.scalars.return_value = iter(rows or [])
    mock_result.scalar_one_or_none.return_value = None
    db = MagicMock()
    db.execute = AsyncMock(return_value=mock_result)
    db.get = AsyncMock(return_value=None)
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    return db


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
async def test_update_exam_applies_fields():
    exam = _make_exam("Old Title")
    db = _mock_db()
    db.refresh = AsyncMock(side_effect=lambda obj: None)
    updated = await update_exam(db, exam, ExamUpdate(title="New Title"))
    assert updated.title == "New Title"
    db.commit.assert_awaited_once()


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
    assert tables == ["judge_results", "submissions", "exam_assignments", "exams"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_exam_cleans_up_dependent_rows():
    """I1: exams with submissions/assignments must not 500 — deps have no DB
    cascade, so they're deleted in FK order (judge_results → submissions →
    assignments → exam)."""
    exam = _make_exam()
    sub = MagicMock()
    sub.submission_id = uuid.uuid4()
    judge_result = MagicMock()
    assignment = _make_assignment(exam.exam_id, uuid.uuid4(), uuid.uuid4())

    def _result(rows):
        r = MagicMock()
        r.scalars.return_value = iter(rows)
        return r

    db = _mock_db()
    db.execute = AsyncMock(side_effect=[
        _result([sub]),           # submissions for this exam
        _result([judge_result]),  # judge results for those submissions
        _result([assignment]),    # assignments for this exam
    ])

    await delete_exam(db, exam)

    deleted = [call.args[0] for call in db.delete.await_args_list]
    assert judge_result in deleted
    assert sub in deleted
    assert assignment in deleted
    assert exam in deleted
    db.commit.assert_awaited_once()


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

def _client_for(user: User):
    async def override_db():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def _clear_overrides():
    app.dependency_overrides.clear()


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
