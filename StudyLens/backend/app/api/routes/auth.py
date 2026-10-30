from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.models import User
from app.db.session import AsyncSessionLocal
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])


@router.post('/register', response_model=UserOut)
@limiter.limit('5/minute')
async def register(request: Request, body: RegisterRequest) -> UserOut:
    email = body.email.lower()
    async with AsyncSessionLocal() as session:
        existing = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail='Email already registered')
        user = User(email=email, hashed_password=hash_password(body.password))
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return UserOut(id=user.id, email=user.email)


@router.post('/login', response_model=TokenResponse)
@limiter.limit('5/minute')
async def login(request: Request, body: LoginRequest) -> TokenResponse:
    email = body.email.lower()
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None or not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')
        return TokenResponse(
            access_token=create_access_token(str(user.id)),
            refresh_token=create_refresh_token(str(user.id)),
        )


@router.post('/refresh', response_model=TokenResponse)
@limiter.limit('10/minute')
async def refresh(request: Request, body: RefreshRequest) -> TokenResponse:
    try:
        user_id = decode_token(body.refresh_token, expected_type='refresh')
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid refresh token') from None
    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


@router.get('/me', response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=user.id, email=user.email)
