"""
Auth service unit tests. DB session is fully mocked — no Postgres required.
Integration tests that need a real DB are in test_auth_integration.py.
"""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services.auth import (
    create_access_token,
    hash_password,
    login,
    logout,
    refresh,
    require_role,
    verify_password,
)


def _make_user(role: str = "candidate") -> User:
    u = User()
    u.user_id = uuid.uuid4()
    u.name = "Test User"
    u.email = "test@example.com"
    u.password_hash = hash_password("secret")
    u.role = role
    return u


def _make_token(user_id: uuid.UUID, revoked: bool = False, expired: bool = False) -> RefreshToken:
    t = RefreshToken()
    t.token_id = uuid.uuid4()
    t.user_id = user_id
    t.revoked = revoked
    t.expires_at = (
        datetime.now(UTC) - timedelta(hours=1)
        if expired
        else datetime.now(UTC) + timedelta(days=7)
    )
    return t


# --- password helpers ---

def test_hash_and_verify():
    h = hash_password("mypassword")
    assert verify_password("mypassword", h)
    assert not verify_password("wrong", h)


# --- create_access_token ---

def test_create_access_token_contains_sub_and_role():
    from jose import jwt
    from app.config import settings

    user = _make_user("interviewer")
    token = create_access_token(user)
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    assert payload["sub"] == str(user.user_id)
    assert payload["role"] == "interviewer"


# --- login ---

@pytest.mark.asyncio
async def test_login_success():
    user = _make_user()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=user)))
    db.add = MagicMock()
    db.commit = AsyncMock()

    access, refresh_tok, returned_user = await login(db, "test@example.com", "secret")
    assert access
    assert refresh_tok
    assert returned_user is user
    db.add.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_login_wrong_password_raises_401():
    user = _make_user()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=user)))

    with pytest.raises(HTTPException) as exc:
        await login(db, "test@example.com", "wrongpassword")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email_raises_401():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    with pytest.raises(HTTPException) as exc:
        await login(db, "nobody@example.com", "secret")
    assert exc.value.status_code == 401


# --- refresh ---

@pytest.mark.asyncio
async def test_refresh_valid_token_returns_new_access_token():
    user = _make_user()
    token = _make_token(user.user_id)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=token)))
    db.get = AsyncMock(return_value=user)

    new_access = await refresh(db, str(token.token_id))
    assert new_access


@pytest.mark.asyncio
async def test_refresh_revoked_token_raises_401():
    user = _make_user()
    token = _make_token(user.user_id, revoked=True)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=token)))

    with pytest.raises(HTTPException) as exc:
        await refresh(db, str(token.token_id))
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_refresh_expired_token_raises_401():
    user = _make_user()
    token = _make_token(user.user_id, expired=True)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=token)))

    with pytest.raises(HTTPException) as exc:
        await refresh(db, str(token.token_id))
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_refresh_invalid_uuid_raises_401():
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        await refresh(db, "not-a-uuid")
    assert exc.value.status_code == 401


# --- logout ---

@pytest.mark.asyncio
async def test_logout_marks_token_revoked():
    user = _make_user()
    token = _make_token(user.user_id)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=token)))
    db.commit = AsyncMock()

    await logout(db, str(token.token_id))
    assert token.revoked is True
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_logout_unknown_token_is_noop():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
    db.commit = AsyncMock()

    await logout(db, str(uuid.uuid4()))
    db.commit.assert_not_called()


# --- require_role ---

def test_require_role_allowed():
    user = _make_user("interviewer")
    require_role(user, "interviewer", "admin")  # should not raise


def test_require_role_denied():
    user = _make_user("candidate")
    with pytest.raises(HTTPException) as exc:
        require_role(user, "interviewer", "admin")
    assert exc.value.status_code == 403
