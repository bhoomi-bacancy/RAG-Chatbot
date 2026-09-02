from typing import List, Optional
from app.database import search_chunks, user_has_chunks
from app.services.embedder import embed_query
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

    query_embedding = embed_query(query)

    results = search_chunks(
        query_embedding=query_embedding,
        user_id=user_id,
        document_ids=document_ids,
        top_k=top_k,
    )

    chunks = []
    for row in results:
        similarity = row.get("similarity", 0.0)
        if similarity < 0.3:
            continue
        chunks.append(
            {
                "text": row["content"],
                "document_id": row["document_id"],
                "filename": row["filename"],
                "page_number": row["page_number"],
                "similarity": round(float(similarity), 4),
            }
        )

    return chunks
