from app.supabase_client import get_supabase


def add_chunks(chunks: list[dict]):
    """Insert chunk records into Supabase document_chunks table."""
    sb = get_supabase()
    sb.table("document_chunks").insert(chunks).execute()


def search_chunks(
    query: str,
    user_id: str,
    document_ids: list[str] | None = None,
    top_k: int = 5,
) -> list[dict]:
    sb = get_supabase()
    result = sb.rpc(
        "search_document_chunks",
        {
            "query_text": query,
            "match_count": top_k,
            "filter_user_id": user_id,
            "filter_document_ids": document_ids or None,
        },
    ).execute()
    return result.data or []


def delete_chunks(document_id: str, user_id: str):
    sb = get_supabase()
    (
        sb.table("document_chunks")
        .delete()
        .eq("document_id", document_id)
        .eq("user_id", user_id)
        .execute()
    )


def user_has_chunks(user_id: str) -> bool:
    try:
        sb = get_supabase()
        result = (
            sb.table("document_chunks").select("id").eq("user_id", user_id).limit(1).execute()
        )
        return bool(result.data)
    except Exception:
        return False


def search_chunks_safe(
    query: str,
    user_id: str,
    document_ids: list[str] | None = None,
    top_k: int = 5,
) -> list[dict]:
    try:
        return search_chunks(query, user_id, document_ids, top_k)
    except Exception:
        return []


def get_fallback_chunks(
    user_id: str,
    document_ids: list[str] | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Return chunks directly from the DB when FTS finds no keyword matches."""
    try:
        sb = get_supabase()
        q = (
            sb.table("document_chunks")
            .select("id, document_id, user_id, filename, page_number, content")
            .eq("user_id", user_id)
        )
        if document_ids:
            q = q.in_("document_id", document_ids)
        result = q.order("page_number").limit(top_k).execute()
        return [{"rank": 0.0, **row} for row in (result.data or [])]
    except Exception:
        return []
