import uuid
from datetime import UTC, datetime, timedelta

import anyio
from fastapi import HTTPException
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.refresh_token import RefreshToken
from app.models.user import User

# Monkeypatch bcrypt to avoid ValueError in bcrypt >= 5.0.0 (enforces 72-byte password limit)
try:
    import bcrypt
    _orig_hashpw = bcrypt.hashpw
    _orig_checkpw = getattr(bcrypt, "checkpw", None)

    def _patched_hashpw(password: bytes, salt: bytes) -> bytes:
        if isinstance(password, bytes) and len(password) > 72:
            password = password[:72]
        return _orig_hashpw(password, salt)

    bcrypt.hashpw = _patched_hashpw

    if _orig_checkpw:
        def _patched_checkpw(password: bytes, hashed_password: bytes) -> bool:
            if isinstance(password, bytes) and len(password) > 72:
                password = password[:72]
            return _orig_checkpw(password, hashed_password)
        bcrypt.checkpw = _patched_checkpw
except Exception:
    pass

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")



def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user: User) -> str:
    exp = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user.user_id), "role": user.role, "exp": exp},
        settings.SECRET_KEY,
        algorithm="HS256",
    )


async def login(db: AsyncSession, email: str, password: str) -> tuple[str, str, User]:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    password_ok = user is not None and await anyio.to_thread.run_sync(
        verify_password, password, user.password_hash
    )
    if user is None or user.is_active is False or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user)

    token = RefreshToken(
        user_id=user.user_id,
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(token)
    await db.commit()

    return access_token, str(token.token_id), user


async def refresh(db: AsyncSession, refresh_token: str) -> str:
    try:
        token_id = uuid.UUID(refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(RefreshToken).where(RefreshToken.token_id == token_id))
    token = result.scalar_one_or_none()

    now = datetime.now(UTC)
    if (
        token is None
        or token.revoked
        or token.expires_at.replace(tzinfo=UTC) < now
    ):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = await db.get(User, token.user_id)
    if user is None or user.is_active is False:
        raise HTTPException(status_code=401, detail="User not found")

    return create_access_token(user)


async def logout(db: AsyncSession, refresh_token: str) -> None:
    try:
        token_id = uuid.UUID(refresh_token)
    except ValueError:
        return  # treat unknown token as already logged out

    result = await db.execute(select(RefreshToken).where(RefreshToken.token_id == token_id))
    token = result.scalar_one_or_none()
    if token:
        token.revoked = True
        await db.commit()


def require_role(user: User, *allowed: str) -> None:
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


async def seed_admin(db: AsyncSession) -> None:
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        return
    result = await db.execute(select(User).where(User.role == "admin"))
    if result.scalar_one_or_none() is not None:
        return
    admin = User(
        name=settings.ADMIN_NAME,
        email=settings.ADMIN_EMAIL,
        password_hash=await anyio.to_thread.run_sync(hash_password, settings.ADMIN_PASSWORD),
        role="admin",
    )
    db.add(admin)
    try:
        await db.commit()
    except Exception:
        # Another worker beat us to it — treat duplicate as success
        await db.rollback()
