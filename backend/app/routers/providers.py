from urllib.parse import urlencode
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import jwt as pyjwt

from app.config import settings
from app.services.auth_service import get_current_user
from app.stores.provider_store import connect_provider, list_connected_providers, disconnect_provider
from app.stores.key_store import save_user_key, get_all_keys, list_key_providers, delete_user_key

router = APIRouter()

VALID_PROVIDERS = {"openai", "anthropic", "google", "ollama"}

GOOGLE_AUTH_URL      = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL     = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_SCOPE         = "openid email profile"


# ── Platform-configured providers (public, no auth) ───────────────────────────

@router.get("/configured")
async def get_configured_providers():
    """Returns which providers have valid platform API keys. No auth required."""
    from app.services.generator import _platform_key
    available = ["groq"]
    for p in ("openai", "anthropic", "google", "ollama"):
        if _platform_key(p):
            available.append(p)
    return {"configured": available}


# ── User API keys (save / list / delete) ──────────────────────────────────────

class SaveKeyRequest(BaseModel):
    provider: str
    api_key: str


@router.post("/key")
async def save_provider_key(req: SaveKeyRequest, current_user: dict = Depends(get_current_user)):
    if req.provider not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")
    save_user_key(current_user["id"], req.provider, req.api_key)
    return {"status": "saved", "provider": req.provider}


@router.get("/my-keys")
async def get_my_keys(current_user: dict = Depends(get_current_user)):
    """Returns which providers the user has keys for, plus the keys themselves for frontend caching."""
    all_keys = get_all_keys(current_user["id"])
    connected = [p for p, k in all_keys.items() if k]
    return {"connected": connected, "keys": all_keys}


@router.delete("/key/{provider}")
async def delete_provider_key(provider: str, current_user: dict = Depends(get_current_user)):
    if provider not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    delete_user_key(current_user["id"], provider)
    return {"status": "deleted", "provider": provider}


# ── List connected providers ───────────────────────────────────────────────────

@router.get("/")
async def get_providers(current_user: dict = Depends(get_current_user)):
    connected = list_connected_providers(current_user["id"])
    return {"connected": connected}


# ── Connect OpenAI / Anthropic (confirm-based, platform pays) ─────────────────

class ConnectRequest(BaseModel):
    provider: str


@router.post("/connect")
async def connect(req: ConnectRequest, current_user: dict = Depends(get_current_user)):
    if req.provider not in {"openai", "anthropic"}:
        raise HTTPException(status_code=400, detail=f"Use the OAuth flow for '{req.provider}'.")
    connect_provider(current_user["id"], req.provider)
    return {"status": "connected", "provider": req.provider}


# ── Google OAuth — step 1: return the auth URL ────────────────────────────────

@router.get("/google/oauth")
async def google_oauth_url(current_user: dict = Depends(get_current_user)):
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured on this platform.")

    # Encode user_id in a short-lived state token
    state = pyjwt.encode(
        {"user_id": current_user["id"], "exp": int(time.time()) + 600},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    callback_url = f"{settings.backend_url}/api/providers/google/callback"
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": GOOGLE_SCOPE,
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return {"auth_url": auth_url}


# ── Google OAuth — step 2: handle callback from Google ────────────────────────

@router.get("/google/callback")
async def google_oauth_callback(code: str = Query(...), state: str = Query(...)):
    # Decode state to get user_id
    try:
        payload = pyjwt.decode(state, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload["user_id"]
    except Exception:
        return RedirectResponse(f"{settings.frontend_url}?provider_error=google")

    # Exchange code for tokens
    callback_url = f"{settings.backend_url}/api/providers/google/callback"
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": callback_url,
                "grant_type": "authorization_code",
            })
            token_resp.raise_for_status()
            tokens = token_resp.json()

            # Fetch Google user info to get stable sub ID
            userinfo_resp = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            userinfo_resp.raise_for_status()
            userinfo = userinfo_resp.json()
    except Exception:
        return RedirectResponse(f"{settings.frontend_url}?provider_error=google")

    google_sub = userinfo.get("sub", "")
    connect_provider(user_id, "google", google_sub=google_sub)

    return RedirectResponse(f"{settings.frontend_url}?provider_connected=google")


# ── Disconnect ─────────────────────────────────────────────────────────────────

@router.delete("/{provider}")
async def disconnect(provider: str, current_user: dict = Depends(get_current_user)):
    if provider not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    disconnect_provider(current_user["id"], provider)
    return {"status": "disconnected", "provider": provider}
