from fastapi import APIRouter, HTTPException, Depends
from app.models import UserCreate, UserLogin, TokenResponse, UserPublic
from app.stores.user_store import create_user, get_by_email, get_usage
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_token,
    get_current_user,
)
from app.config import settings

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
async def register(body: UserCreate):
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user = create_user(
        body.email.lower().strip(),
        body.name.strip(),
        hash_password(body.password),
    )
    if not user:
        raise HTTPException(400, "Email already registered")
    usage = get_usage(user["id"])
    return TokenResponse(
        access_token=create_token(user["id"]),
        user=UserPublic(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            plan=user["plan"],
            daily_usage=usage,
            daily_limit=settings.free_daily_limit,
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = get_by_email(body.email.lower().strip())
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    usage = get_usage(user["id"])
    return TokenResponse(
        access_token=create_token(user["id"]),
        user=UserPublic(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            plan=user["plan"],
            daily_usage=usage,
            daily_limit=settings.free_daily_limit,
        ),
    )


@router.get("/me", response_model=UserPublic)
async def me(current_user: dict = Depends(get_current_user)):
    usage = get_usage(current_user["id"])
    return UserPublic(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        plan=current_user["plan"],
        daily_usage=usage,
        daily_limit=settings.free_daily_limit,
    )
