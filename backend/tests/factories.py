"""
Shared test factories and helpers.

Object factories build fully-populated ORM instances (no DB required); the
client helpers override FastAPI's auth/DB dependencies for router tests.
"""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.database import get_db
from app.deps import get_current_user
from app.main import app
from app.models.exam import Exam
from app.models.exam_assignment import ExamAssignment
from app.models.exam_attempt import ExamAttempt
from app.models.problem import Problem
from app.models.submission import Submission
from app.models.user import User
from app.services.auth import hash_password

# ── object factories ────────────────────────────────────────────────────────

def make_user(role: str = "candidate") -> User:
    u = User()
    u.user_id = uuid.uuid4()
    u.name = "Test User"
    u.email = f"{role}-{u.user_id}@example.com"
    u.password_hash = hash_password("secret")
    u.role = role
    u.is_active = True
    u.created_at = datetime.now(UTC)
    u.updated_at = datetime.now(UTC)
    return u


def make_exam(
    title: str = "Test Exam",
    *,
    ended: bool = False,
    show_score: bool = False,
    anti_cheat_enabled: bool = False,
    test_time_minutes: int | None = None,
) -> Exam:
    e = Exam()
    e.exam_id = uuid.uuid4()
    e.title = title
    e.description = None
    e.start_time = datetime.now(UTC) - timedelta(hours=2)
    e.end_time = datetime.now(UTC) + (timedelta(hours=-1) if ended else timedelta(hours=2))
    e.show_score = show_score
    e.anti_cheat_enabled = anti_cheat_enabled
    e.test_time_minutes = test_time_minutes
    e.created_by = uuid.uuid4()
    e.created_at = datetime.now(UTC)
    return e


def make_attempt(
    exam_id: uuid.UUID,
    candidate_id: uuid.UUID,
    *,
    status: str = "in_progress",
    started_at: datetime | None = None,
    deadline_at: datetime | None = None,
) -> ExamAttempt:
    started_at = started_at or datetime.now(UTC) - timedelta(minutes=5)
    a = ExamAttempt()
    a.attempt_id = uuid.uuid4()
    a.exam_id = exam_id
    a.candidate_id = candidate_id
    a.started_at = started_at
    a.deadline_at = deadline_at or started_at + timedelta(minutes=30)
    a.ended_at = None
    a.status = status
    a.fullscreen_exit_started_at = None
    a.force_end_at = None
    a.created_at = started_at
    a.updated_at = started_at
    return a


def make_problem(title: str = "Two Sum") -> Problem:
    p = Problem()
    p.problem_id = uuid.uuid4()
    p.title = title
    p.description = "Find two numbers that add to target."
    p.input_format = None
    p.output_format = None
    p.sample_input = None
    p.sample_output = None
    p.difficulty = "easy"
    p.time_limit = 1000
    p.memory_limit = 256
    p.allowed_langs = ["python3", "cpp17"]
    p.created_by = uuid.uuid4()
    p.created_at = datetime.now(UTC)
    return p


def make_assignment(
    exam_id: uuid.UUID, candidate_id: uuid.UUID, problem_id: uuid.UUID
) -> ExamAssignment:
    a = ExamAssignment()
    a.assignment_id = uuid.uuid4()
    a.exam_id = exam_id
    a.candidate_id = candidate_id
    a.problem_id = problem_id
    a.assigned_difficulty = None
    a.created_at = datetime.now(UTC)
    return a


def make_submission(
    candidate_id: uuid.UUID,
    exam_id: uuid.UUID,
    problem_id: uuid.UUID,
    status: str = "pending",
) -> Submission:
    s = Submission()
    s.submission_id = uuid.uuid4()
    s.exam_id = exam_id
    s.problem_id = problem_id
    s.candidate_id = candidate_id
    s.language = "python3"
    s.code_storage_key = f"submissions/{s.submission_id}/code.py"
    s.status = status
    s.ip_address = "127.0.0.1"
    s.submitted_at = datetime.now(UTC)
    return s


# ── mock DB session ──────────────────────────────────────────────────────────

def mock_db(rows=None) -> MagicMock:
    """Mock AsyncSession whose execute() yields `rows` via scalars()."""
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


# ── router test client (auth + DB dependency overrides) ──────────────────────

def client_for(user: User) -> TestClient:
    async def override_db():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def clear_overrides() -> None:
    app.dependency_overrides.clear()
