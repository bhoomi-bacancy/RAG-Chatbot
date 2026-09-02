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
    sb = get_supabase()
    result = (
        sb.table("document_chunks").select("id").eq("user_id", user_id).limit(1).execute()
    )
    return bool(result.data)
