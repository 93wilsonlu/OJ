import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.models.exam import Exam
from app.models.problem import Problem
from app.models.user import User
from app.schemas.submission import SubmissionRunCreate
from app.services import custom_run

def test_get_redis():
    with patch("app.services.custom_run.redis") as mock_redis:
        with patch("app.services.custom_run._redis", None):
            r = custom_run.get_redis()
            mock_redis.from_url.assert_called_once()
            assert r is mock_redis.from_url.return_value

def test_data_language_allowed():
    # Language is None
    p = Problem()
    p.allowed_langs = ["python3"]
    assert custom_run.data_language_allowed(p, None) is True
    
    # Language allowed
    assert custom_run.data_language_allowed(p, "python3") is True
    
    # Language not allowed
    assert custom_run.data_language_allowed(p, "cpp17") is False

@pytest.mark.asyncio
async def test_get_assigned_problem_exam_not_found():
    db = AsyncMock()
    db.get.side_effect = [None, Problem()] # exam not found
    
    with pytest.raises(HTTPException) as exc:
        await custom_run._get_assigned_problem(db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
    assert exc.value.status_code == 404
    assert exc.value.detail == "Exam not found"

@pytest.mark.asyncio
async def test_get_assigned_problem_problem_not_found():
    db = AsyncMock()
    db.get.side_effect = [Exam(), None] # problem not found
    
    with pytest.raises(HTTPException) as exc:
        await custom_run._get_assigned_problem(db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
    assert exc.value.status_code == 404
    assert exc.value.detail == "Problem not found"

@pytest.mark.asyncio
async def test_get_assigned_problem_not_assigned():
    db = AsyncMock()
    db.get.side_effect = [Exam(), Problem()]
    
    # Mock no assignment in database
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_result
    
    with pytest.raises(HTTPException) as exc:
        await custom_run._get_assigned_problem(db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not assigned to this problem in this exam"

@pytest.mark.asyncio
async def test_create_run_non_candidate():
    db = AsyncMock()
    user = User(role="interviewer")
    data = SubmissionRunCreate(exam_id=uuid.uuid4(), problem_id=uuid.uuid4(), language="python3", code="print(1)", stdin="")
    
    with pytest.raises(HTTPException) as exc:
        await custom_run.create_run(db, user, data)
    assert exc.value.status_code == 403

@pytest.mark.asyncio
async def test_create_run_exam_not_accepting():
    db = AsyncMock()
    user = User(role="candidate", user_id=uuid.uuid4())
    data = SubmissionRunCreate(exam_id=uuid.uuid4(), problem_id=uuid.uuid4(), language="python3", code="print(1)", stdin="")
    
    exam = Exam()
    problem = Problem(allowed_langs=["python3"])
    
    # Mock get_assigned_problem to return exam and problem
    # Mock get_exam_access to return can_solve = False
    mock_access = MagicMock(can_solve=False)
    with patch("app.services.custom_run._get_assigned_problem", return_value=(exam, problem)), \
         patch("app.services.exam.get_exam_access", return_value=mock_access):
        with pytest.raises(HTTPException) as exc:
            await custom_run.create_run(db, user, data)
        assert exc.value.status_code == 403
        assert exc.value.detail == "Exam is not accepting runs"

@pytest.mark.asyncio
async def test_create_run_language_not_allowed():
    db = AsyncMock()
    user = User(role="candidate", user_id=uuid.uuid4())
    data = SubmissionRunCreate(exam_id=uuid.uuid4(), problem_id=uuid.uuid4(), language="cpp17", code="print(1)", stdin="")
    
    exam = Exam()
    problem = Problem(allowed_langs=["python3"]) # cpp17 not allowed
    
    mock_access = MagicMock(can_solve=True)
    with patch("app.services.custom_run._get_assigned_problem", return_value=(exam, problem)), \
         patch("app.services.exam.get_exam_access", return_value=mock_access), \
         patch("app.services.proctoring.ensure_candidate_not_locked"):
        with pytest.raises(HTTPException) as exc:
            await custom_run.create_run(db, user, data)
        assert exc.value.status_code == 422

@pytest.mark.asyncio
async def test_create_run_already_active():
    db = AsyncMock()
    user = User(role="candidate", user_id=uuid.uuid4())
    data = SubmissionRunCreate(exam_id=uuid.uuid4(), problem_id=uuid.uuid4(), language="python3", code="print(1)", stdin="")
    
    exam = Exam()
    problem = Problem(allowed_langs=["python3"])
    
    mock_redis = MagicMock()
    mock_redis.get.return_value = "some_run_id" # active run exists
    
    mock_access = MagicMock(can_solve=True)
    with patch("app.services.custom_run._get_assigned_problem", return_value=(exam, problem)), \
         patch("app.services.exam.get_exam_access", return_value=mock_access), \
         patch("app.services.proctoring.ensure_candidate_not_locked"), \
         patch("app.services.custom_run.get_redis", return_value=mock_redis):
        with pytest.raises(HTTPException) as exc:
            await custom_run.create_run(db, user, data)
        assert exc.value.status_code == 429
        assert "already active" in exc.value.detail

@pytest.mark.asyncio
async def test_create_run_rate_limited():
    db = AsyncMock()
    user = User(role="candidate", user_id=uuid.uuid4())
    data = SubmissionRunCreate(exam_id=uuid.uuid4(), problem_id=uuid.uuid4(), language="python3", code="print(1)", stdin="")
    
    exam = Exam()
    problem = Problem(allowed_langs=["python3"])
    
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_redis.set.return_value = False # rate limit hit
    
    mock_access = MagicMock(can_solve=True)
    with patch("app.services.custom_run._get_assigned_problem", return_value=(exam, problem)), \
         patch("app.services.exam.get_exam_access", return_value=mock_access), \
         patch("app.services.proctoring.ensure_candidate_not_locked"), \
         patch("app.services.custom_run.get_redis", return_value=mock_redis):
        with pytest.raises(HTTPException) as exc:
            await custom_run.create_run(db, user, data)
        assert exc.value.status_code == 429
        assert "Wait before running" in exc.value.detail

@pytest.mark.asyncio
async def test_create_run_queue_busy():
    db = AsyncMock()
    user = User(role="candidate", user_id=uuid.uuid4())
    data = SubmissionRunCreate(exam_id=uuid.uuid4(), problem_id=uuid.uuid4(), language="python3", code="print(1)", stdin="")
    
    exam = Exam()
    problem = Problem(allowed_langs=["python3"])
    
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_redis.set.return_value = True
    
    mock_queue = MagicMock()
    mock_queue.count = 101 # busy
    
    mock_access = MagicMock(can_solve=True)
    with patch("app.services.custom_run._get_assigned_problem", return_value=(exam, problem)), \
         patch("app.services.exam.get_exam_access", return_value=mock_access), \
         patch("app.services.proctoring.ensure_candidate_not_locked"), \
         patch("app.services.custom_run.get_redis", return_value=mock_redis), \
         patch("app.services.queue.get_run_queue", return_value=mock_queue):
        with pytest.raises(HTTPException) as exc:
            await custom_run.create_run(db, user, data)
        assert exc.value.status_code == 429
        assert "Run queue is busy" in exc.value.detail

@pytest.mark.asyncio
async def test_create_run_enqueue_failure_cleanup():
    db = AsyncMock()
    user = User(role="candidate", user_id=uuid.uuid4())
    data = SubmissionRunCreate(exam_id=uuid.uuid4(), problem_id=uuid.uuid4(), language="python3", code="print(1)", stdin="")
    
    exam = Exam()
    problem = Problem(allowed_langs=["python3"])
    
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_redis.set.return_value = True
    
    mock_queue = MagicMock()
    mock_queue.count = 0
    
    mock_access = MagicMock(can_solve=True)
    with patch("app.services.custom_run._get_assigned_problem", return_value=(exam, problem)), \
         patch("app.services.exam.get_exam_access", return_value=mock_access), \
         patch("app.services.proctoring.ensure_candidate_not_locked"), \
         patch("app.services.custom_run.get_redis", return_value=mock_redis), \
         patch("app.services.queue.get_run_queue", return_value=mock_queue), \
         patch("app.services.queue.enqueue_custom_run", side_effect=Exception("Redis down")):
        with pytest.raises(Exception) as exc:
            await custom_run.create_run(db, user, data)
        # Redis delete should be called for active key and run key
        mock_redis.delete.assert_called()

def test_get_run_permissions():
    user = User(role="interviewer")
    with pytest.raises(HTTPException) as exc:
        custom_run.get_run(user, uuid.uuid4())
    assert exc.value.status_code == 403

def test_get_run_not_found():
    user = User(role="candidate", user_id=uuid.uuid4())
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    with patch("app.services.custom_run.get_redis", return_value=mock_redis):
        with pytest.raises(HTTPException) as exc:
            custom_run.get_run(user, uuid.uuid4())
        assert exc.value.status_code == 404

def test_get_run_candidate_mismatch():
    user = User(role="candidate", user_id=uuid.uuid4())
    mock_redis = MagicMock()
    # Return run details belonging to another candidate
    mock_redis.get.return_value = json.dumps({"candidate_id": str(uuid.uuid4())})
    with patch("app.services.custom_run.get_redis", return_value=mock_redis):
        with pytest.raises(HTTPException) as exc:
            custom_run.get_run(user, uuid.uuid4())
        assert exc.value.status_code == 404

def test_get_run_success():
    user = User(role="candidate", user_id=uuid.uuid4())
    mock_redis = MagicMock()
    payload = {"candidate_id": str(user.user_id), "status": "ok"}
    mock_redis.get.return_value = json.dumps(payload)
    with patch("app.services.custom_run.get_redis", return_value=mock_redis):
        res = custom_run.get_run(user, uuid.uuid4())
        assert res == payload
