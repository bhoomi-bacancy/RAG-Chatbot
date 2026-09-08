from typing import List, Optional
from app.database import search_chunks_safe, get_fallback_chunks
from app.config import settings


def retrieve_chunks(
    query: str,
    document_ids: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    top_k: int = None,
) -> List[dict]:
    top_k = top_k or settings.top_k

    results = search_chunks_safe(
        query=query,
        user_id=user_id,
        document_ids=document_ids,
        top_k=top_k,
    )

    # FTS found nothing — fall back to returning chunks directly so the LLM
    # still has document context even when keywords don't match the question.
    if not results:
        results = get_fallback_chunks(user_id, document_ids, top_k)

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
