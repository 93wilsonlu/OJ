from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    RefreshRequest,
    RefreshResponse,
    UserOut,
)
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    access_token, refresh_token, user = await auth_service.login(db, body.email, body.password)
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut(
            user_id=str(user.user_id),
            name=user.name,
            email=user.email,
            role=user.role,
        ),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    access_token = await auth_service.refresh(db, body.refresh_token)
    return RefreshResponse(access_token=access_token)


@router.post("/logout", status_code=204)
async def logout(body: LogoutRequest, db: AsyncSession = Depends(get_db)):
    await auth_service.logout(db, body.refresh_token)
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        user_id=str(current_user.user_id),
        name=current_user.name,
        email=current_user.email,
        role=current_user.role,
    )
