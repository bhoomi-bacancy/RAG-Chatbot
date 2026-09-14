import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends

import httpx

from app.models import (
    UserCreate, UserLogin, TokenResponse, UserPublic,
    ForgotPasswordRequest, ResetPasswordRequest, AvatarUpdateRequest,
    GoogleAuthRequest, FacebookAuthRequest, InstagramAuthRequest, LinkedInAuthRequest,
)
from app.stores.user_store import (
    create_user, get_by_email, get_by_id, get_usage,
    save_reset_token, get_by_reset_token, update_password, clear_reset_token,
    update_avatar, find_or_create_sso_user,
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
            avatar_url=user.get("avatar_url"),
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = get_by_email(body.email.lower().strip())
    if not user:
        raise HTTPException(401, "Invalid email or password")
    if user.get("password_hash") == "SSO_NO_PASSWORD":
        raise HTTPException(401, "This account uses Google/Facebook sign-in. Please use the social login button.")
    if not verify_password(body.password, user["password_hash"]):
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
            avatar_url=user.get("avatar_url"),
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
        avatar_url=current_user.get("avatar_url"),
    )


@router.post("/avatar", response_model=UserPublic)
async def upload_avatar(body: AvatarUpdateRequest, current_user: dict = Depends(get_current_user)):
    update_avatar(current_user["id"], body.avatar_url)
    usage = get_usage(current_user["id"])
    return UserPublic(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        plan=current_user["plan"],
        daily_usage=usage,
        daily_limit=settings.free_daily_limit,
        avatar_url=body.avatar_url,
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


@router.post("/google", response_model=TokenResponse)
async def google_login(body: GoogleAuthRequest):
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {body.access_token}"},
                timeout=10.0,
            )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Google token")
        info = r.json()
    except httpx.RequestError:
        raise HTTPException(503, "Could not reach Google servers")
    email = info.get("email", "").lower().strip()
    if not email:
        raise HTTPException(400, "Google account has no email")
    user = find_or_create_sso_user(email, info.get("name", ""), info.get("picture"))
    if not user:
        raise HTTPException(500, "Failed to create user")
    usage = get_usage(user["id"])
    return TokenResponse(
        access_token=create_token(user["id"]),
        user=UserPublic(
            id=user["id"], email=user["email"], name=user["name"],
            plan=user["plan"], daily_usage=usage,
            daily_limit=settings.free_daily_limit,
            avatar_url=user.get("avatar_url"),
        ),
    )


@router.post("/facebook", response_model=TokenResponse)
async def facebook_login(body: FacebookAuthRequest):
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://graph.facebook.com/me",
                params={"fields": "id,name,email,picture.type(large)", "access_token": body.access_token},
                timeout=10.0,
            )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Facebook token")
        info = r.json()
        if "error" in info:
            raise HTTPException(401, "Invalid Facebook token")
    except httpx.RequestError:
        raise HTTPException(503, "Could not reach Facebook servers")
    email = info.get("email", "").lower().strip()
    if not email:
        raise HTTPException(400, "Facebook account has no email or email permission was not granted")
    avatar_url = info.get("picture", {}).get("data", {}).get("url")
    user = find_or_create_sso_user(email, info.get("name", ""), avatar_url)
    if not user:
        raise HTTPException(500, "Failed to create user")
    usage = get_usage(user["id"])
    return TokenResponse(
        access_token=create_token(user["id"]),
        user=UserPublic(
            id=user["id"], email=user["email"], name=user["name"],
            plan=user["plan"], daily_usage=usage,
            daily_limit=settings.free_daily_limit,
            avatar_url=user.get("avatar_url"),
        ),
    )


@router.post("/instagram", response_model=TokenResponse)
async def instagram_login(body: InstagramAuthRequest):
    # Instagram uses Meta/Facebook's platform — access_token is a Facebook token
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://graph.facebook.com/me",
                params={"fields": "id,name,email,picture.type(large)", "access_token": body.access_token},
                timeout=10.0,
            )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Instagram/Meta token")
        info = r.json()
        if "error" in info:
            raise HTTPException(401, "Invalid Instagram/Meta token")
    except httpx.RequestError:
        raise HTTPException(503, "Could not reach Meta servers")
    email = info.get("email", "").lower().strip()
    if not email:
        raise HTTPException(400, "Instagram account has no email or permission not granted")
    avatar_url = info.get("picture", {}).get("data", {}).get("url")
    user = find_or_create_sso_user(email, info.get("name", ""), avatar_url)
    if not user:
        raise HTTPException(500, "Failed to create user")
    usage = get_usage(user["id"])
    return TokenResponse(
        access_token=create_token(user["id"]),
        user=UserPublic(
            id=user["id"], email=user["email"], name=user["name"],
            plan=user["plan"], daily_usage=usage,
            daily_limit=settings.free_daily_limit,
            avatar_url=user.get("avatar_url"),
        ),
    )


@router.post("/linkedin", response_model=TokenResponse)
async def linkedin_login(body: LinkedInAuthRequest):
    if not settings.linkedin_client_id or not settings.linkedin_client_secret:
        raise HTTPException(503, "LinkedIn Sign-In is not configured")
    try:
        async with httpx.AsyncClient() as client:
            token_r = await client.post(
                "https://www.linkedin.com/oauth/v2/accessToken",
                data={
                    "grant_type": "authorization_code",
                    "code": body.code,
                    "redirect_uri": body.redirect_uri,
                    "client_id": settings.linkedin_client_id,
                    "client_secret": settings.linkedin_client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15.0,
            )
            if token_r.status_code != 200:
                raise HTTPException(401, "LinkedIn token exchange failed")
            access_token = token_r.json().get("access_token")
            info_r = await client.get(
                "https://api.linkedin.com/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10.0,
            )
            if info_r.status_code != 200:
                raise HTTPException(401, "Failed to get LinkedIn profile")
            info = info_r.json()
    except httpx.RequestError:
        raise HTTPException(503, "Could not reach LinkedIn servers")
    email = info.get("email", "").lower().strip()
    if not email:
        raise HTTPException(400, "LinkedIn account has no email or email permission not granted")
    name = info.get("name") or f"{info.get('given_name', '')} {info.get('family_name', '')}".strip()
    user = find_or_create_sso_user(email, name, info.get("picture"))
    if not user:
        raise HTTPException(500, "Failed to create user")
    usage = get_usage(user["id"])
    return TokenResponse(
        access_token=create_token(user["id"]),
        user=UserPublic(
            id=user["id"], email=user["email"], name=user["name"],
            plan=user["plan"], daily_usage=usage,
            daily_limit=settings.free_daily_limit,
            avatar_url=user.get("avatar_url"),
        ),
    )
