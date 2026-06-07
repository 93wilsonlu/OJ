import uuid
import pytest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.models.exam_candidate_state import ExamCandidateState
from app.services import proctoring

def make_mock_db():
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db

@pytest.mark.asyncio
async def test_get_candidate_state_new():
    db = make_mock_db()
    # Mocking first query execution returning None (no state exists yet)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_result
    
    exam_id = uuid.uuid4()
    candidate_id = uuid.uuid4()
    
    state = await proctoring.get_candidate_state(db, exam_id, candidate_id)
    assert state.exam_id == exam_id
    assert state.candidate_id == candidate_id
    assert state.status == "active"
    db.add.assert_called_once_with(state)
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(state)

@pytest.mark.asyncio
async def test_ensure_candidate_not_locked():
    db = make_mock_db()
    # Mock status is "locked"
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = "locked"
    db.execute.return_value = mock_result
    
    with pytest.raises(HTTPException) as exc_info:
        await proctoring.ensure_candidate_not_locked(db, uuid.uuid4(), uuid.uuid4())
    assert exc_info.value.status_code == 403
    
    # Mock status is "active" (should not raise exception)
    mock_result.scalar_one_or_none.return_value = "active"
    await proctoring.ensure_candidate_not_locked(db, uuid.uuid4(), uuid.uuid4())

@pytest.mark.asyncio
async def test_register_event_violating_first_time():
    db = make_mock_db()
    state = ExamCandidateState(
        exam_id=uuid.uuid4(),
        candidate_id=uuid.uuid4(),
        status="active",
        warning_started_at=None
    )
    
    with patch("app.services.proctoring.get_candidate_state", return_value=state):
        res = await proctoring.register_event(db, state.exam_id, state.candidate_id, "tab-switch", True)
        assert res.warning_started_at is not None
        assert res.status == "active"
        assert res.last_event_type == "tab-switch"

@pytest.mark.asyncio
async def test_register_event_violating_lock():
    db = make_mock_db()
    state = ExamCandidateState(
        exam_id=uuid.uuid4(),
        candidate_id=uuid.uuid4(),
        status="active",
        warning_started_at=datetime.now(UTC) - timedelta(seconds=12)
    )
    
    with patch("app.services.proctoring.get_candidate_state", return_value=state):
        res = await proctoring.register_event(db, state.exam_id, state.candidate_id, "tab-switch", True)
        assert res.status == "locked"
        assert res.locked_at is not None
        assert res.lock_reason == "tab-switch"

@pytest.mark.asyncio
async def test_register_event_not_violating():
    db = make_mock_db()
    state = ExamCandidateState(
        exam_id=uuid.uuid4(),
        candidate_id=uuid.uuid4(),
        status="active",
        warning_started_at=datetime.now(UTC)
    )
    
    with patch("app.services.proctoring.get_candidate_state", return_value=state):
        res = await proctoring.register_event(db, state.exam_id, state.candidate_id, "tab-switch", False)
        assert res.warning_started_at is None
        assert res.status == "active"
