from app.supabase_client import get_supabase


def get_memories(user_id: str) -> list[str]:
    try:
        sb = get_supabase()
        res = (
            sb.table("user_memories")
            .select("memory")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return [row["memory"] for row in (res.data or [])]
    except Exception:
        return []


def get_memories_with_ids(user_id: str) -> list[dict]:
    sb = get_supabase()
    res = (
        sb.table("user_memories")
        .select("id, memory, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    return res.data or []


def add_memory(user_id: str, memory: str) -> None:
    sb = get_supabase()
    # Avoid exact duplicates
    existing = (
        sb.table("user_memories")
        .select("id")
        .eq("user_id", user_id)
        .eq("memory", memory)
        .limit(1)
        .execute()
    )
    if not existing.data:
        sb.table("user_memories").insert({"user_id": user_id, "memory": memory}).execute()


def delete_memory(user_id: str, memory_id: str) -> None:
    sb = get_supabase()
    sb.table("user_memories").delete().eq("id", memory_id).eq("user_id", user_id).execute()


def clear_memories(user_id: str) -> None:
    sb = get_supabase()
    sb.table("user_memories").delete().eq("user_id", user_id).execute()
