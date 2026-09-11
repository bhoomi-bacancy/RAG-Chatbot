from typing import List, Optional
from app.database import search_chunks_safe, get_fallback_chunks
from app.config import settings

_SUMMARY_TRIGGERS = {
    "summarize", "summary", "summarise", "overview", "brief", "briefly",
    "describe", "explain", "what is this", "what does this", "what does the",
    "tell me about", "key points", "main points", "highlights", "outline",
    "what happened", "what are the", "what is in", "give me",
}


def _is_summary_query(query: str) -> bool:
    q = query.lower()
    return any(t in q for t in _SUMMARY_TRIGGERS)


def retrieve_chunks(
    query: str,
    document_ids: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    top_k: int = None,
) -> List[dict]:
    top_k = top_k or settings.top_k

    # For summarisation-type queries fetch more chunks so the LLM has enough context
    is_summary = _is_summary_query(query)
    effective_k = min(top_k * 3, 20) if is_summary else top_k

    results = search_chunks_safe(
        query=query,
        user_id=user_id,
        document_ids=document_ids,
        top_k=effective_k,
    )

    # When FTS finds nothing, fall back to direct chunk fetch so the LLM always
    # sees document content (e.g. "summarize this" has no keyword overlap).
    # - document_ids provided → fetch from those specific docs
    # - document_ids=None → fetch from all user uploads (Documents page uploads)
    if not results:
        results = get_fallback_chunks(user_id, document_ids, effective_k)

    return [
        {
            "text": row["content"],
            "document_id": row["document_id"],
            "filename": row["filename"],
            "page_number": row["page_number"],
            "similarity": round(float(row.get("rank", 0.0)), 4),
        }
        for row in results
    ]
