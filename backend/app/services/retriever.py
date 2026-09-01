from typing import List, Optional
from app.database import get_collection
from app.services.embedder import embed_query
from app.config import settings


def retrieve_chunks(
    query: str,
    document_ids: Optional[List[str]] = None,
    top_k: int = None,
) -> List[dict]:
    top_k = top_k or settings.top_k
    collection = get_collection()

    total = collection.count()
    if total == 0:
        return []

    query_embedding = embed_query(query)

    where_filter = None
    if document_ids:
        if len(document_ids) == 1:
            where_filter = {"document_id": document_ids[0]}
        else:
            where_filter = {"document_id": {"$in": document_ids}}

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, total),
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )

    chunks: List[dict] = []
    if results["documents"] and results["documents"][0]:
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            chunks.append(
                {
                    "text": doc,
                    "document_id": meta.get("document_id", ""),
                    "filename": meta.get("filename", "Unknown"),
                    "page_number": meta.get("page_number", 1),
                    "similarity": round(max(0.0, 1 - dist), 4),
                }
            )

    return chunks
