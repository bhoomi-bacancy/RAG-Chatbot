from datetime import date, datetime, timezone
from app.supabase_client import get_supabase
from app.config import settings


def create_user(email: str, name: str, password_hash: str):
    sb = get_supabase()
    existing = sb.table("users").select("id").eq("email", email).limit(1).execute()
    if existing.data:
        return None
    result = sb.table("users").insert({
        "email": email,
        "name": name,
        "password_hash": password_hash,
        "plan": "free",
        "daily_usage": 0,
    }).execute()
    return result.data[0] if result.data else None


def get_by_email(email: str):
    sb = get_supabase()
    result = sb.table("users").select("*").eq("email", email).limit(1).execute()
    return result.data[0] if result.data else None


def get_by_id(uid: str):
    sb = get_supabase()
    result = sb.table("users").select("*").eq("id", uid).limit(1).execute()
    return result.data[0] if result.data else None


def increment_usage(uid: str):
    sb = get_supabase()
    user = get_by_id(uid)
    if not user:
        return
    today = str(date.today())
    if user.get("usage_date") != today:
        sb.table("users").update({"daily_usage": 1, "usage_date": today}).eq("id", uid).execute()
    else:
        sb.table("users").update({"daily_usage": (user.get("daily_usage") or 0) + 1}).eq("id", uid).execute()


def get_usage(uid: str) -> int:
    user = get_by_id(uid)
    if not user or user.get("usage_date") != str(date.today()):
        return 0
    return user.get("daily_usage", 0)


# ── Password reset ────────────────────────────────────────────────────────────

def save_reset_token(user_id: str, token: str, expiry: datetime) -> None:
    sb = get_supabase()
    sb.table("users").update({
        "reset_token": token,
        "reset_token_expiry": expiry.isoformat(),
    }).eq("id", user_id).execute()


def get_by_reset_token(token: str):
    sb = get_supabase()
    result = sb.table("users").select("*").eq("reset_token", token).limit(1).execute()
    return result.data[0] if result.data else None


def update_password(user_id: str, new_password_hash: str) -> None:
    sb = get_supabase()
    sb.table("users").update({"password_hash": new_password_hash}).eq("id", user_id).execute()


def clear_reset_token(user_id: str) -> None:
    sb = get_supabase()
    sb.table("users").update({
        "reset_token": None,
        "reset_token_expiry": None,
    }).eq("id", user_id).execute()
