"""
Submission service unit tests + router integration tests.
No Postgres or Redis required — all external dependencies are mocked.

Critical success criteria (Phase 5):
  - Candidate submits → status=pending, submission_id returned
  - Submitting after end_time → 403
  - Rate limit blocks second submit within 30s → 429
  - Only-candidate role can POST /submissions
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
from app.models.submission import Submission
from app.models.user import User
from app.schemas.submission import SubmissionCreate
from app.services.auth import hash_password
from app.services.submission import (
    _check_rate_limit,
    create_submission,
    get_submission_source_code,
    get_submission,
    list_submissions,
)


# ── factories ─────────────────────────────────────────────────────────────────

def _make_user(role: str = "candidate") -> User:
    u = User()
    u.user_id = uuid.uuid4()
    u.name = "Test"
    u.email = "test@example.com"
    u.password_hash = hash_password("secret")
    u.role = role
    return u


def _make_exam(ended: bool = False) -> Exam:
    e = Exam()
    e.exam_id = uuid.uuid4()
    e.title = "Exam"
    e.description = None
    offset = timedelta(hours=-1) if ended else timedelta(hours=1)
    e.start_time = datetime.now(UTC) - timedelta(hours=2)
    e.end_time = datetime.now(UTC) + offset
    e.show_score = False
    e.created_by = uuid.uuid4()
    e.created_at = datetime.now(UTC) - timedelta(hours=2)
    return e


def _make_assignment(exam_id: uuid.UUID, candidate_id: uuid.UUID, problem_id: uuid.UUID) -> ExamAssignment:
    a = ExamAssignment()
    a.assignment_id = uuid.uuid4()
    a.exam_id = exam_id
    a.candidate_id = candidate_id
    a.problem_id = problem_id
    a.assigned_difficulty = None
    a.created_at = datetime.now(UTC)
    return a


def _make_submission(candidate_id: uuid.UUID, exam_id: uuid.UUID, problem_id: uuid.UUID) -> Submission:
    s = Submission()
    s.submission_id = uuid.uuid4()
    s.exam_id = exam_id
    s.problem_id = problem_id
    s.candidate_id = candidate_id
    s.language = "python3"
    s.code_storage_key = f"submissions/{s.submission_id}/code.py"
    s.status = "pending"
    s.ip_address = "127.0.0.1"
    s.submitted_at = datetime.now(UTC)
    return s


def _mock_db():
    mock_result = MagicMock()
    mock_result.scalars.return_value = iter([])
    mock_result.scalar_one_or_none.return_value = None
    db = MagicMock()
    db.execute = AsyncMock(return_value=mock_result)
    db.get = AsyncMock(return_value=None)
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ── service: rate limit ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rate_limit_raises_429_when_recent_submission_exists():
    candidate_id = uuid.uuid4()
    exam_id = uuid.uuid4()
    problem_id = uuid.uuid4()

    db = _mock_db()
    recent = _make_submission(candidate_id, exam_id, problem_id)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = recent
    db.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc:
        await _check_rate_limit(db, candidate_id, exam_id, problem_id)
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_rate_limit_passes_when_no_recent_submission():
    db = _mock_db()  # scalar_one_or_none returns None → no recent submission
    # Should not raise
    await _check_rate_limit(db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())


# ── service: create submission ─────────────────────────────────────────────────

@pytest.mark.asyncio
@patch("app.services.submission.queue_service.enqueue_submission")
@patch("app.services.submission.storage.put_object")
async def test_create_submission_after_end_time_raises_403(mock_put, mock_enqueue):
    ended_exam = _make_exam(ended=True)
    db = _mock_db()
    db.get = AsyncMock(return_value=ended_exam)

    data = SubmissionCreate(
        exam_id=ended_exam.exam_id,
        problem_id=uuid.uuid4(),
        language="python3",
        code="print('hello')",
    )

    with pytest.raises(HTTPException) as exc:
        await create_submission(db, data, uuid.uuid4(), "127.0.0.1")

    assert exc.value.status_code == 403
    assert "ended" in exc.value.detail.lower()
    mock_put.assert_not_called()
    mock_enqueue.assert_not_called()


@pytest.mark.asyncio
@patch("app.services.submission.queue_service.enqueue_submission")
@patch("app.services.submission.storage.put_object")
async def test_create_submission_without_assignment_raises_403(mock_put, mock_enqueue):
    exam = _make_exam()
    candidate_id = uuid.uuid4()
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)
    # No assignment found (scalar_one_or_none returns None)

    data = SubmissionCreate(
        exam_id=exam.exam_id,
        problem_id=uuid.uuid4(),
        language="python3",
        code="print('hello')",
    )

    with pytest.raises(HTTPException) as exc:
        await create_submission(db, data, candidate_id, "127.0.0.1")

    assert exc.value.status_code == 403
    assert "assigned" in exc.value.detail.lower()


@pytest.mark.asyncio
@patch("app.services.submission.queue_service.enqueue_submission")
@patch("app.services.submission.storage.put_object")
async def test_create_submission_success(mock_put, mock_enqueue):
    exam = _make_exam()
    candidate_id = uuid.uuid4()
    problem_id = uuid.uuid4()
    assignment = _make_assignment(exam.exam_id, candidate_id, problem_id)

    db = _mock_db()
    db.get = AsyncMock(return_value=exam)

    # First execute call → assignment check (found)
    # Second execute call → rate limit check (none found)
    assignment_result = MagicMock()
    assignment_result.scalar_one_or_none.return_value = assignment
    no_result = MagicMock()
    no_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[assignment_result, no_result])

    data = SubmissionCreate(
        exam_id=exam.exam_id,
        problem_id=problem_id,
        language="python3",
        code="print('hello')",
    )

    submission = await create_submission(db, data, candidate_id, "127.0.0.1")

    assert submission.status == "pending"
    assert submission.candidate_id == candidate_id
    assert submission.language == "python3"
    mock_put.assert_called_once()
    mock_enqueue.assert_called_once_with(submission.submission_id)
    db.commit.assert_awaited_once()


# ── service: get / list ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_submission_not_found_raises_404():
    db = _mock_db()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await get_submission(db, uuid.uuid4(), uuid.uuid4(), "candidate")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_submission_candidate_cannot_see_others():
    candidate_id = uuid.uuid4()
    other_id = uuid.uuid4()
    exam_id = uuid.uuid4()
    problem_id = uuid.uuid4()
    submission = _make_submission(other_id, exam_id, problem_id)

    db = _mock_db()
    db.get = AsyncMock(return_value=submission)

    with pytest.raises(HTTPException) as exc:
        await get_submission(db, submission.submission_id, candidate_id, "candidate")
    assert exc.value.status_code == 403


# ── router integration ─────────────────────────────────────────────────────────

@patch("app.services.submission.storage.get_object_text")
def test_get_submission_source_code_returns_stored_code(mock_get_text):
    candidate_id = uuid.uuid4()
    exam_id = uuid.uuid4()
    problem_id = uuid.uuid4()
    submission = _make_submission(candidate_id, exam_id, problem_id)
    mock_get_text.return_value = "print('hello')\n"

    assert get_submission_source_code(submission) == "print('hello')\n"
    mock_get_text.assert_called_once_with(submission.code_storage_key)


@patch("app.services.submission.storage.get_object_text")
def test_get_submission_source_code_returns_none_when_storage_fails(mock_get_text):
    candidate_id = uuid.uuid4()
    exam_id = uuid.uuid4()
    problem_id = uuid.uuid4()
    submission = _make_submission(candidate_id, exam_id, problem_id)
    mock_get_text.side_effect = RuntimeError("storage unavailable")

    assert get_submission_source_code(submission) is None


def _client_for(user: User):
    async def override_db():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def _clear_overrides():
    app.dependency_overrides.clear()


@patch("app.routers.submission.submission_service.create_submission", new_callable=AsyncMock)
def test_interviewer_gets_403_on_post_submission(mock_create):
    interviewer = _make_user("interviewer")
    client = _client_for(interviewer)
    try:
        resp = client.post(
            "/api/v1/submissions",
            json={
                "exam_id": str(uuid.uuid4()),
                "problem_id": str(uuid.uuid4()),
                "language": "python3",
                "code": "print(1)",
            },
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 403
    mock_create.assert_not_called()


@patch("app.routers.submission.submission_service.create_submission", new_callable=AsyncMock)
def test_oversized_code_rejected_422(mock_create):
    """H5: code beyond the cap is rejected by schema validation before the service."""
    from app.schemas.submission import MAX_CODE_CHARS

    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        resp = client.post(
            "/api/v1/submissions",
            json={
                "exam_id": str(uuid.uuid4()),
                "problem_id": str(uuid.uuid4()),
                "language": "python3",
                "code": "x" * (MAX_CODE_CHARS + 1),
            },
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 422
    mock_create.assert_not_called()


@patch("app.routers.submission.submission_service.create_submission", new_callable=AsyncMock)
def test_candidate_post_submission_returns_202(mock_create):
    candidate = _make_user("candidate")
    exam_id = uuid.uuid4()
    problem_id = uuid.uuid4()
    submission = _make_submission(candidate.user_id, exam_id, problem_id)
    mock_create.return_value = submission

    client = _client_for(candidate)
    try:
        resp = client.post(
            "/api/v1/submissions",
            json={
                "exam_id": str(exam_id),
                "problem_id": str(problem_id),
                "language": "python3",
                "code": "print(1)",
            },
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "pending"
    assert data["submission_id"] == str(submission.submission_id)
    mock_create.assert_called_once_with(ANY, ANY, candidate.user_id, ANY)
