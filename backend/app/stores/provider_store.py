from typing import Optional
from app.supabase_client import get_supabase


def connect_provider(user_id: str, provider: str, google_sub: Optional[str] = None) -> None:
    sb = get_supabase()
    row = {"user_id": user_id, "provider": provider}
    if google_sub:
        row["google_sub"] = google_sub
    sb.table("user_provider_connections").upsert(
        row, on_conflict="user_id,provider"
    ).execute()


def list_connected_providers(user_id: str) -> list[str]:
    sb = get_supabase()
    result = (
        sb.table("user_provider_connections")
        .select("provider")
        .eq("user_id", user_id)
        .execute()
    )
    return [r["provider"] for r in result.data]


def disconnect_provider(user_id: str, provider: str) -> None:
    sb = get_supabase()
    sb.table("user_provider_connections").delete().eq("user_id", user_id).eq(
        "provider", provider
    ).execute()
