"""
Admin user-management service tests + router RBAC coverage.
DB session is mocked; no Postgres required.
"""
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import get_db
from app.deps import get_current_user
from app.main import app
from app.models.user import User
from app.schemas.admin import AdminUserCreate, AdminUserUpdate
from app.services.admin import create_user, deactivate_user, update_user
from app.services.auth import hash_password


def _make_user(role: str = "admin") -> User:
    user = User()
    user.user_id = uuid.uuid4()
    user.name = "Test User"
    user.email = f"{role}-{user.user_id}@example.com"
    user.password_hash = hash_password("secret123")
    user.role = role
    user.is_active = True
    user.created_at = datetime.now(UTC)
    user.updated_at = datetime.now(UTC)
    return user


def _mock_db() -> MagicMock:
    db = MagicMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    db.get = AsyncMock(return_value=None)
    return db


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


def _client_for(user: User):
    async def override_db():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def _clear_overrides():
    app.dependency_overrides.clear()


def test_non_admin_gets_403_on_user_list():
    candidate = _make_user("candidate")
    client = _client_for(candidate)
    try:
        response = client.get("/api/v1/admin/users")
    finally:
        _clear_overrides()

    assert response.status_code == 403
