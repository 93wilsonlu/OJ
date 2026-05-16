import math
import uuid

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.admin import AdminUserCreate, AdminUserUpdate
from app.services.auth import hash_password


def _require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _require_user_creator(user: User, requested_role: str) -> None:
    if user.role == "admin":
        return
    if user.role == "interviewer" and requested_role == "candidate":
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions")


async def create_user(
    db: AsyncSession,
    current_user: User,
    data: AdminUserCreate,
) -> User:
    _require_user_creator(current_user, data.role)

    user = User(
        name=data.name.strip(),
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already exists")
    await db.refresh(user)
    return user


async def list_users(
    db: AsyncSession,
    current_user: User,
    *,
    role: str | None,
    name: str | None,
    page: int,
    page_size: int,
) -> tuple[list[User], int, int]:
    _require_admin(current_user)

    filters = []
    if role:
        filters.append(User.role == role)
    if name:
        pattern = f"%{name.strip()}%"
        filters.append(or_(User.name.ilike(pattern), User.email.ilike(pattern)))

    count_stmt = select(func.count()).select_from(User)
    query_stmt = select(User).order_by(User.created_at.desc(), User.email.asc())
    for condition in filters:
        count_stmt = count_stmt.where(condition)
        query_stmt = query_stmt.where(condition)

    total = int((await db.execute(count_stmt)).scalar_one())
    offset = (page - 1) * page_size
    rows = await db.execute(query_stmt.offset(offset).limit(page_size))
    total_pages = max(1, math.ceil(total / page_size))
    return list(rows.scalars()), total, total_pages


async def get_user(db: AsyncSession, current_user: User, user_id: uuid.UUID) -> User:
    _require_admin(current_user)
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def update_user(
    db: AsyncSession,
    current_user: User,
    user_id: uuid.UUID,
    data: AdminUserUpdate,
) -> User:
    _require_admin(current_user)
    user = await get_user(db, current_user, user_id)

    updates = data.model_dump(exclude_unset=True)
    if user.user_id == current_user.user_id and "role" in updates:
        raise HTTPException(status_code=403, detail="Cannot change your own role")

    for field, value in updates.items():
        if field == "name":
            value = value.strip()
        setattr(user, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already exists")
    await db.refresh(user)
    return user


async def deactivate_user(
    db: AsyncSession,
    current_user: User,
    user_id: uuid.UUID,
) -> None:
    _require_admin(current_user)
    user = await get_user(db, current_user, user_id)
    if user.user_id == current_user.user_id:
        raise HTTPException(status_code=403, detail="Cannot deactivate your own account")

    user.is_active = False
    await db.commit()
