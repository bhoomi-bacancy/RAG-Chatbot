import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends

from app.models import (
    UserCreate, UserLogin, TokenResponse, UserPublic,
    ForgotPasswordRequest, ResetPasswordRequest,
)
from app.stores.user_store import (
    create_user, get_by_email, get_by_id, get_usage,
    save_reset_token, get_by_reset_token, update_password, clear_reset_token,
)
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_token,
    get_current_user,
)
from app.services.email_service import send_password_reset_email
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


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    _SAFE_RESPONSE = {"message": "If that email is registered, a reset link has been sent."}

    user = get_by_email(body.email.lower().strip())
    if not user:
        return _SAFE_RESPONSE

    token = secrets.token_urlsafe(32)
    expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    save_reset_token(user["id"], token, expiry)

    try:
        send_password_reset_email(
            to_email=body.email.lower().strip(),
            reset_token=token,
            user_name=user["name"],
            frontend_url=settings.frontend_url,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Failed to send reset email. Please try again later.",
        )

    return _SAFE_RESPONSE


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    user = get_by_reset_token(body.token)
    if not user:
        raise HTTPException(400, "Invalid or expired reset link.")

    expiry_str = user.get("reset_token_expiry")
    if expiry_str:
        try:
            expiry = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
            if expiry < datetime.now(timezone.utc):
                raise HTTPException(400, "Reset link has expired. Please request a new one.")
        except ValueError:
            raise HTTPException(400, "Invalid reset link.")

    update_password(user["id"], hash_password(body.new_password))
    clear_reset_token(user["id"])

    return {"message": "Password updated successfully. You can now log in."}
