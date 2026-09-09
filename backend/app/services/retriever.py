from typing import List, Optional
from app.database import search_chunks_safe
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

    # No fallback — if FTS finds nothing the question doesn't match the documents.
    # Return empty so the LLM answers from general knowledge without injecting
    # irrelevant document chunks that would anchor the response to the wrong topic.

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
