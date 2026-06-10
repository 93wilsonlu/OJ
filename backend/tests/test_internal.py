import json
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.config import settings
from app.database import get_db
from app.main import app
from tests.factories import make_submission

TOKEN = settings.INTERNAL_TOKEN


def _db_override(db):
    async def _get():
        yield db
    return _get


def _no_jr_db(submission=None):
    db = MagicMock()
    db.get = AsyncMock(return_value=submission)
    no_result = MagicMock()
    no_result.scalar_one_or_none.return_value = None
    no_result.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=no_result)
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def _judge_payload(submission_id, *, verdict="Accepted", submission_status="completed"):
    return {
        "submission_id": str(submission_id),
        "verdict": verdict,
        "score": 100.0,
        "passed_count": 5,
        "total_count": 5,
        "execution_time": 123,
        "memory_usage": 4,
        "error_message": None,
        "submission_status": submission_status,
    }


# ── auth ───────────────────────────────────────────────────────────────────────

def test_judge_result_requires_token():
    client = TestClient(app)
    resp = client.post("/api/v1/internal/judge-result", json=_judge_payload(uuid.uuid4()))
    assert resp.status_code == 401


def test_judge_result_rejects_wrong_token():
    client = TestClient(app)
    resp = client.post(
        "/api/v1/internal/judge-result",
        json=_judge_payload(uuid.uuid4()),
        headers={"X-Internal-Token": "bad-token"},
    )
    assert resp.status_code == 401


def test_mark_stuck_requires_token():
    client = TestClient(app)
    resp = client.post("/api/v1/internal/mark-stuck")
    assert resp.status_code == 401


# ── /judge-result ──────────────────────────────────────────────────────────────

def test_judge_result_writes_jr_and_returns_204():
    submission = make_submission(uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), status="judging")
    db = _no_jr_db(submission)

    app.dependency_overrides[get_db] = _db_override(db)
    try:
        resp = TestClient(app).post(
            "/api/v1/internal/judge-result",
            json=_judge_payload(submission.submission_id),
            headers={"X-Internal-Token": TOKEN},
        )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 204
    db.add.assert_called_once()
    db.commit.assert_awaited_once()
    assert submission.status == "completed"


def test_judge_result_sets_failed_status_when_system_error():
    submission = make_submission(uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), status="judging")
    db = _no_jr_db(submission)

    app.dependency_overrides[get_db] = _db_override(db)
    try:
        resp = TestClient(app).post(
            "/api/v1/internal/judge-result",
            json=_judge_payload(
                submission.submission_id,
                verdict="System Error",
                submission_status="failed",
            ),
            headers={"X-Internal-Token": TOKEN},
        )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 204
    assert submission.status == "failed"


def test_judge_result_idempotent_when_jr_already_exists():
    existing_jr = MagicMock()
    db = MagicMock()
    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = existing_jr
    db.execute = AsyncMock(return_value=existing_result)
    db.add = MagicMock()
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = _db_override(db)
    try:
        resp = TestClient(app).post(
            "/api/v1/internal/judge-result",
            json=_judge_payload(uuid.uuid4()),
            headers={"X-Internal-Token": TOKEN},
        )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 204
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


# ── /mark-stuck ────────────────────────────────────────────────────────────────

def test_mark_stuck_marks_old_judging_submissions():
    old_submission = make_submission(uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), status="judging")
    old_submission.submitted_at = datetime.now(UTC) - timedelta(hours=1)

    db = MagicMock()
    stuck_result = MagicMock()
    stuck_result.scalars.return_value.all.return_value = [old_submission]
    no_jr = MagicMock()
    no_jr.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[stuck_result, no_jr])
    db.add = MagicMock()
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = _db_override(db)
    try:
        resp = TestClient(app).post(
            "/api/v1/internal/mark-stuck",
            headers={"X-Internal-Token": TOKEN},
        )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json()["marked"] == 1
    assert old_submission.status == "failed"
    db.commit.assert_awaited_once()


def test_mark_stuck_returns_zero_when_none_stuck():
    db = MagicMock()
    empty_result = MagicMock()
    empty_result.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=empty_result)
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = _db_override(db)
    try:
        resp = TestClient(app).post(
            "/api/v1/internal/mark-stuck",
            headers={"X-Internal-Token": TOKEN},
        )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json()["marked"] == 0
    db.commit.assert_not_awaited()


# ── /run-result ────────────────────────────────────────────────────────────────

def _run_result_payload(run_id):
    return {
        "run_id": str(run_id),
        "verdict": "OK",
        "execution_time": 42,
        "memory_usage": 1024,
        "stdout": "hello\n",
        "stderr": "",
        "stdout_truncated": False,
        "stderr_truncated": False,
        "error_message": None,
    }


def test_run_result_requires_token():
    client = TestClient(app)
    resp = client.post("/api/v1/internal/run-result", json=_run_result_payload(uuid.uuid4()))
    assert resp.status_code == 401


def test_run_result_stores_result_and_clears_active_key():
    candidate_id = uuid.uuid4()
    run_id = uuid.uuid4()
    initial_record = {"run_id": str(run_id), "candidate_id": str(candidate_id), "status": "queued"}
    mock_redis = MagicMock()
    mock_redis.get.return_value = json.dumps(initial_record)

    with patch("app.routers.internal.get_redis", return_value=mock_redis):
        resp = TestClient(app).post(
            "/api/v1/internal/run-result",
            json=_run_result_payload(run_id),
            headers={"X-Internal-Token": TOKEN},
        )

    assert resp.status_code == 204
    mock_redis.setex.assert_called_once()
    stored = json.loads(mock_redis.setex.call_args[0][2])
    assert stored["status"] == "completed"
    assert stored["verdict"] == "OK"
    assert stored["stdout"] == "hello\n"
    mock_redis.delete.assert_called_once()


def test_run_result_idempotent_when_already_completed():
    run_id = uuid.uuid4()
    completed_record = {
        "run_id": str(run_id), "candidate_id": str(uuid.uuid4()),
        "status": "completed", "verdict": "OK",
    }
    mock_redis = MagicMock()
    mock_redis.get.return_value = json.dumps(completed_record)

    with patch("app.routers.internal.get_redis", return_value=mock_redis):
        resp = TestClient(app).post(
            "/api/v1/internal/run-result",
            json=_run_result_payload(run_id),
            headers={"X-Internal-Token": TOKEN},
        )

    assert resp.status_code == 204
    mock_redis.setex.assert_not_called()


def test_run_result_noop_when_run_not_found():
    mock_redis = MagicMock()
    mock_redis.get.return_value = None

    with patch("app.routers.internal.get_redis", return_value=mock_redis):
        resp = TestClient(app).post(
            "/api/v1/internal/run-result",
            json=_run_result_payload(uuid.uuid4()),
            headers={"X-Internal-Token": TOKEN},
        )

    assert resp.status_code == 204
    mock_redis.setex.assert_not_called()
