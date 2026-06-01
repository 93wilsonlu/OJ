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

from app.schemas.submission import SubmissionCreate, SubmissionRunCreate
from app.services import custom_run
from app.services.submission import (
    SubmissionListRow,
    _check_rate_limit,
    create_submission,
    get_submission,
    get_submission_source_code,
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
    make_submission as _make_submission,
)
from tests.factories import (
    make_user as _make_user,
)
from tests.factories import (
    mock_db as _mock_db,
)

# ── factories ─────────────────────────────────────────────────────────────────

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
async def test_create_submission_before_start_time_raises_403(mock_put, mock_enqueue):
    """I2: submissions before the exam start_time are rejected with 403."""
    exam = _make_exam()
    exam.start_time = datetime.now(UTC) + timedelta(minutes=10)
    exam.end_time = datetime.now(UTC) + timedelta(hours=2)
    db = _mock_db()
    db.get = AsyncMock(return_value=exam)

    data = SubmissionCreate(
        exam_id=exam.exam_id,
        problem_id=uuid.uuid4(),
        language="python3",
        code="print('hello')",
    )

    with pytest.raises(HTTPException) as exc:
        await create_submission(db, data, uuid.uuid4(), "127.0.0.1")

    assert exc.value.status_code == 403
    assert "not started" in exc.value.detail.lower()
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
    db.execute = AsyncMock(side_effect=[assignment_result, no_result, no_result])

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


@pytest.mark.asyncio
@patch("app.services.submission.queue_service.enqueue_submission")
@patch("app.services.submission.storage.put_object")
async def test_create_submission_locked_candidate_raises_403(mock_put, mock_enqueue):
    exam = _make_exam()
    candidate_id = uuid.uuid4()
    problem_id = uuid.uuid4()
    assignment = _make_assignment(exam.exam_id, candidate_id, problem_id)

    db = _mock_db()
    db.get = AsyncMock(return_value=exam)

    assignment_result = MagicMock()
    assignment_result.scalar_one_or_none.return_value = assignment
    locked_result = MagicMock()
    locked_result.scalar_one_or_none.return_value = "locked"
    db.execute = AsyncMock(side_effect=[assignment_result, locked_result])

    data = SubmissionCreate(
        exam_id=exam.exam_id,
        problem_id=problem_id,
        language="python3",
        code="print('hello')",
    )

    with pytest.raises(HTTPException) as exc:
        await create_submission(db, data, candidate_id, "127.0.0.1")

    assert exc.value.status_code == 403
    assert "proctoring" in exc.value.detail.lower()
    mock_put.assert_not_called()
    mock_enqueue.assert_not_called()


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
    # 404 (not 403): cross-candidate access must not leak submission existence.
    assert exc.value.status_code == 404


# ── router integration ─────────────────────────────────────────────────────────

@patch("app.services.submission.storage.get_object_text")
async def test_get_submission_source_code_returns_stored_code(mock_get_text):
    candidate_id = uuid.uuid4()
    exam_id = uuid.uuid4()
    problem_id = uuid.uuid4()
    submission = _make_submission(candidate_id, exam_id, problem_id)
    mock_get_text.return_value = "print('hello')\n"

    assert await get_submission_source_code(submission) == "print('hello')\n"
    mock_get_text.assert_called_once_with(submission.code_storage_key)


@patch("app.services.submission.storage.get_object_text")
async def test_get_submission_source_code_returns_none_when_storage_fails(mock_get_text):
    candidate_id = uuid.uuid4()
    exam_id = uuid.uuid4()
    problem_id = uuid.uuid4()
    submission = _make_submission(candidate_id, exam_id, problem_id)
    mock_get_text.side_effect = RuntimeError("storage unavailable")

    assert await get_submission_source_code(submission) is None


# ── C2: error_message gated like score ──────────────────────────────────────────

def _make_judge_result(error_message: str = "boom: internal trace"):
    jr = MagicMock()
    jr.result_id = uuid.uuid4()
    jr.submission_id = uuid.uuid4()
    jr.verdict = "System Error"
    jr.score = 0
    jr.passed_count = 0
    jr.total_count = 3
    jr.execution_time = 0
    jr.memory_usage = 0
    jr.error_message = error_message
    jr.judged_at = datetime.now(UTC)
    return jr


def test_judge_result_hides_error_message_when_score_hidden():
    from app.routers.submission import _judge_result_out

    out = _judge_result_out(_make_judge_result(), hide_score=True)
    assert out.score is None
    assert out.error_message is None


def test_judge_result_shows_error_message_when_score_visible():
    from app.routers.submission import _judge_result_out

    out = _judge_result_out(_make_judge_result(), hide_score=False)
    assert out.error_message == "boom: internal trace"


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


@patch("app.routers.submission.submission_service.list_submissions", new_callable=AsyncMock)
def test_interviewer_can_search_submissions_by_candidate(mock_list):
    interviewer = _make_user("interviewer")
    candidate = _make_user("candidate")
    candidate.name = "Alice Candidate"
    candidate.email = "alice@gmail.com"
    exam = _make_exam("Backend Interview")
    problem_id = uuid.uuid4()
    submission = _make_submission(candidate.user_id, exam.exam_id, problem_id)
    mock_list.return_value = [
        SubmissionListRow(
            submission=submission,
            judge_result=None,
            exam_title=exam.title,
            problem_title="Two Sum",
            candidate_name=candidate.name,
            candidate_email=candidate.email,
            exam_show_score=True,
        )
    ]

    client = _client_for(interviewer)
    try:
        resp = client.get("/api/v1/submissions?candidate=alice@gmail.com")
    finally:
        _clear_overrides()

    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["exam_title"] == "Backend Interview"
    assert data[0]["candidate_email"] == "alice@gmail.com"
    mock_list.assert_called_once_with(
        ANY, interviewer.user_id, "interviewer", None, None, "alice@gmail.com"
    )


class _FakeRedis:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    def setex(self, key, ttl, value):
        self.values[key] = value

    def delete(self, key):
        self.values.pop(key, None)


@pytest.mark.asyncio
@patch("app.services.custom_run.queue_service.enqueue_custom_run")
@patch("app.services.custom_run.queue_service.get_run_queue")
@patch("app.services.custom_run.get_redis")
async def test_candidate_can_create_custom_run(mock_get_redis, mock_get_run_queue, mock_enqueue):
    candidate = _make_user("candidate")
    exam = _make_exam()
    problem_id = uuid.uuid4()
    problem = MagicMock()
    problem.problem_id = problem_id
    problem.allowed_langs = ["python3"]
    assignment = _make_assignment(exam.exam_id, candidate.user_id, problem_id)

    db = _mock_db()
    db.get = AsyncMock(side_effect=[exam, problem])
    assignment_result = MagicMock()
    assignment_result.scalar_one_or_none.return_value = assignment
    no_state_result = MagicMock()
    no_state_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[assignment_result, no_state_result])

    mock_get_redis.return_value = _FakeRedis()
    mock_get_run_queue.return_value = MagicMock(count=0)

    result = await custom_run.create_run(
        db,
        candidate,
        SubmissionRunCreate(
            exam_id=exam.exam_id,
            problem_id=problem_id,
            language="python3",
            code="print(input())",
            stdin="hello",
        ),
    )

    assert result["status"] == "queued"
    assert result["run_id"]
    mock_enqueue.assert_called_once_with(result["run_id"])


@pytest.mark.asyncio
async def test_interviewer_cannot_create_custom_run():
    interviewer = _make_user("interviewer")
    with pytest.raises(HTTPException) as exc:
        await custom_run.create_run(
            _mock_db(),
            interviewer,
            SubmissionRunCreate(
                exam_id=uuid.uuid4(),
                problem_id=uuid.uuid4(),
                language="python3",
                code="print(1)",
                stdin="",
            ),
        )
    assert exc.value.status_code == 403
