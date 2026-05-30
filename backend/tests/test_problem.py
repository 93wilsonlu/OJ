"""
Problem service unit tests + router integration tests.
No Postgres required — DB session and storage are fully mocked.

Critical success criterion (Phase 3):
  hidden test cases must NOT appear in GET /problems/{id}/test-cases for non-admin users.
"""
import uuid
from datetime import UTC, datetime
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app.deps import get_current_user
from app.models.problem import Problem
from app.models.test_case import TestCase
from app.models.user import User
from app.schemas.problem import ProblemCreate, ProblemUpdate
from app.services.auth import hash_password
from app.services.problem import (
    create_problem,
    delete_problem,
    get_problem,
    list_problems,
    list_test_cases,
    update_problem,
)


# ── factories ─────────────────────────────────────────────────────────────────

def _make_user(role: str = "problem_admin") -> User:
    u = User()
    u.user_id = uuid.uuid4()
    u.name = "Test"
    u.email = "test@example.com"
    u.password_hash = hash_password("secret")
    u.role = role
    return u


def _make_problem() -> Problem:
    p = Problem()
    p.problem_id = uuid.uuid4()
    p.title = "Two Sum"
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
    return p


def _make_test_case(problem_id: uuid.UUID, is_hidden: bool = False) -> TestCase:
    tc = TestCase()
    tc.testcase_id = uuid.uuid4()
    tc.problem_id = problem_id
    tc.input_data_key = f"test-cases/{problem_id}/{tc.testcase_id}/input"
    tc.expected_output_key = f"test-cases/{problem_id}/{tc.testcase_id}/expected"
    tc.is_hidden = is_hidden
    tc.score_weight = 1.0
    return tc


def _mock_db(rows=None):
    """Return a mock AsyncSession whose execute() yields rows via scalars()."""
    mock_result = MagicMock()
    mock_result.scalars.return_value = iter(rows or [])
    db = MagicMock()
    db.execute = AsyncMock(return_value=mock_result)
    db.get = AsyncMock(return_value=None)
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ── service: list / get ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_problems_returns_all():
    problems = [_make_problem(), _make_problem()]
    db = _mock_db(problems)
    result = await list_problems(db)
    assert result == problems


@pytest.mark.asyncio
async def test_get_problem_found():
    problem = _make_problem()
    db = _mock_db()
    db.get = AsyncMock(return_value=problem)
    result = await get_problem(db, problem.problem_id)
    assert result is problem


@pytest.mark.asyncio
async def test_get_problem_not_found():
    db = _mock_db()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await get_problem(db, uuid.uuid4())
    assert exc.value.status_code == 404


# ── service: create / update ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_problem_commits_and_returns():
    db = _mock_db()
    creator_id = uuid.uuid4()
    data = ProblemCreate(
        title="Fizz Buzz",
        description="Classic",
        difficulty="easy",
        time_limit=1000,
        memory_limit=128,
        allowed_langs=["python3"],
    )

    created = await create_problem(db, data, creator_id)

    db.add.assert_called_once()
    db.commit.assert_awaited_once()
    assert created.title == "Fizz Buzz"
    assert created.created_by == creator_id


@pytest.mark.asyncio
async def test_update_problem_applies_fields():
    problem = _make_problem()
    db = _mock_db()
    db.refresh = AsyncMock(side_effect=lambda obj: None)  # no-op

    updated = await update_problem(db, problem, ProblemUpdate(title="New Title"))

    assert updated.title == "New Title"
    db.commit.assert_awaited_once()


# ── service: test case filtering (critical) ───────────────────────────────────

@pytest.mark.asyncio
async def test_list_test_cases_excludes_hidden_when_not_include():
    problem_id = uuid.uuid4()
    visible = _make_test_case(problem_id, is_hidden=False)
    hidden = _make_test_case(problem_id, is_hidden=True)
    db = _mock_db([visible])  # DB returns only visible (WHERE is_hidden = false)

    result = await list_test_cases(db, problem_id, include_hidden=False)

    assert result == [visible]
    assert all(not tc.is_hidden for tc in result)


@pytest.mark.asyncio
async def test_list_test_cases_includes_hidden_for_admin():
    problem_id = uuid.uuid4()
    visible = _make_test_case(problem_id, is_hidden=False)
    hidden = _make_test_case(problem_id, is_hidden=True)
    db = _mock_db([visible, hidden])  # DB returns all (no is_hidden filter)

    result = await list_test_cases(db, problem_id, include_hidden=True)

    assert len(result) == 2


# ── router integration: hidden cases absent from GET response ─────────────────

def _client_for(user: User):
    """Build a TestClient with get_current_user and get_db overridden."""
    async def override_db():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def _clear_overrides():
    app.dependency_overrides.clear()


@patch("app.routers.problem.problem_service.list_test_cases", new_callable=AsyncMock)
@patch("app.routers.problem.problem_service.get_problem", new_callable=AsyncMock)
def test_candidate_gets_403_on_list_test_cases(mock_get_problem, mock_list_tcs):
    """H1 IDOR: candidates can't enumerate test cases; they use /exams/{id}/problems."""
    candidate = _make_user("candidate")
    problem = _make_problem()

    client = _client_for(candidate)
    try:
        resp = client.get(f"/api/v1/problems/{problem.problem_id}/test-cases")
    finally:
        _clear_overrides()

    assert resp.status_code == 403
    mock_list_tcs.assert_not_called()
    mock_get_problem.assert_not_called()


@patch("app.routers.problem.problem_service.list_problems", new_callable=AsyncMock)
def test_candidate_gets_403_on_list_problems(mock_list):
    """H1 IDOR: candidates can't enumerate the problem bank."""
    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        resp = client.get("/api/v1/problems")
    finally:
        _clear_overrides()

    assert resp.status_code == 403
    mock_list.assert_not_called()


@patch("app.routers.problem.problem_service.get_problem", new_callable=AsyncMock)
def test_candidate_gets_403_on_get_problem(mock_get):
    """H1 IDOR: candidates can't read arbitrary problems by UUID."""
    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        resp = client.get(f"/api/v1/problems/{uuid.uuid4()}")
    finally:
        _clear_overrides()

    assert resp.status_code == 403
    mock_get.assert_not_called()


@patch("app.routers.problem.problem_service.list_problems", new_callable=AsyncMock)
def test_interviewer_can_list_problems(mock_list):
    """H1: interviewers retain read access to assign problems to exams."""
    problem = _make_problem()
    problem.created_at = datetime.now(UTC)
    mock_list.return_value = [problem]
    interviewer = _make_user("interviewer")
    client = _client_for(interviewer)
    try:
        resp = client.get("/api/v1/problems")
    finally:
        _clear_overrides()

    assert resp.status_code == 200
    assert len(resp.json()) == 1


@patch("app.routers.problem.problem_service.list_test_cases", new_callable=AsyncMock)
@patch("app.routers.problem.problem_service.get_problem", new_callable=AsyncMock)
def test_problem_admin_receives_hidden_testcases(mock_get_problem, mock_list_tcs):
    """problem_admin GET /test-cases receives all test cases including hidden."""
    admin = _make_user("problem_admin")
    problem = _make_problem()
    visible = _make_test_case(problem.problem_id, is_hidden=False)
    hidden = _make_test_case(problem.problem_id, is_hidden=True)

    mock_get_problem.return_value = problem
    mock_list_tcs.return_value = [visible, hidden]

    client = _client_for(admin)
    try:
        resp = client.get(f"/api/v1/problems/{problem.problem_id}/test-cases")
    finally:
        _clear_overrides()

    assert resp.status_code == 200
    assert len(resp.json()) == 2
    # Router must pass include_hidden=True for problem_admin
    _, _, include_hidden = mock_list_tcs.call_args.args
    assert include_hidden is True


@patch("app.routers.problem.problem_service.create_problem", new_callable=AsyncMock)
def test_candidate_gets_403_on_create_problem(mock_create):
    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        resp = client.post(
            "/api/v1/problems",
            json={
                "title": "X", "description": "Y", "difficulty": "easy",
                "time_limit": 1000, "memory_limit": 256, "allowed_langs": ["python3"],
            },
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 403
    mock_create.assert_not_called()


@patch("app.routers.problem.problem_service.delete_test_case", new_callable=AsyncMock)
@patch("app.routers.problem.problem_service.get_test_case", new_callable=AsyncMock)
def test_problem_admin_can_delete_test_case(mock_get_tc, mock_delete_tc):
    admin = _make_user("problem_admin")
    problem = _make_problem()
    tc = _make_test_case(problem.problem_id)
    mock_get_tc.return_value = tc

    client = _client_for(admin)
    try:
        resp = client.delete(
            f"/api/v1/problems/{problem.problem_id}/test-cases/{tc.testcase_id}"
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 204
    mock_delete_tc.assert_called_once_with(ANY, tc)


@patch("app.routers.problem.problem_service.create_test_case", new_callable=AsyncMock)
@patch("app.routers.problem.problem_service.get_problem", new_callable=AsyncMock)
def test_oversized_test_case_upload_rejected_413(mock_get_problem, mock_create_tc):
    """H5: test-case files larger than the cap are rejected before buffering/storage."""
    from app.routers.problem import MAX_TESTCASE_BYTES

    admin = _make_user("problem_admin")
    problem = _make_problem()
    mock_get_problem.return_value = problem
    oversized = b"x" * (MAX_TESTCASE_BYTES + 1)

    client = _client_for(admin)
    try:
        resp = client.post(
            f"/api/v1/problems/{problem.problem_id}/test-cases",
            files={
                "input_file": ("input.txt", oversized),
                "expected_file": ("expected.txt", b"ok"),
            },
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 413
    mock_create_tc.assert_not_called()


@patch("app.routers.problem.problem_service.create_test_case", new_callable=AsyncMock)
@patch("app.routers.problem.problem_service.get_problem", new_callable=AsyncMock)
def test_non_positive_limit_override_rejected_422(mock_get_problem, mock_create_tc):
    """Per-test limit overrides feed the sandbox shell/cgroup, so reject <= 0."""
    admin = _make_user("problem_admin")
    problem = _make_problem()
    mock_get_problem.return_value = problem

    client = _client_for(admin)
    try:
        resp = client.post(
            f"/api/v1/problems/{problem.problem_id}/test-cases",
            files={
                "input_file": ("input.txt", b"1"),
                "expected_file": ("expected.txt", b"1"),
            },
            data={"time_limit_override": "0", "memory_limit_override": "-5"},
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 422
    mock_create_tc.assert_not_called()


@patch("app.routers.problem.problem_service.delete_test_case", new_callable=AsyncMock)
@patch("app.routers.problem.problem_service.get_test_case", new_callable=AsyncMock)
def test_candidate_gets_403_on_delete_test_case(mock_get_tc, mock_delete_tc):
    candidate = _make_user("candidate")
    problem = _make_problem()
    tc = _make_test_case(problem.problem_id)
    mock_get_tc.return_value = tc

    client = _client_for(candidate)
    try:
        resp = client.delete(
            f"/api/v1/problems/{problem.problem_id}/test-cases/{tc.testcase_id}"
        )
    finally:
        _clear_overrides()

    assert resp.status_code == 403
    mock_delete_tc.assert_not_called()
