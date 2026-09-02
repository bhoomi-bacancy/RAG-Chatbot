from typing import List, Optional
from app.database import search_chunks, user_has_chunks
from app.config import settings


def retrieve_chunks(
    query: str,
    document_ids: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    top_k: int = None,
) -> List[dict]:
    top_k = top_k or settings.top_k

    if user_id and not user_has_chunks(user_id):
        return []

    results = search_chunks(
        query=query,
        user_id=user_id,
        document_ids=document_ids,
        top_k=top_k,
    )

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
