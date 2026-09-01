from pathlib import Path
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.database import get_collection
from app.models import DocumentMetadata, UploadResponse
from app.services.document_processor import process_document
from app.services.embedder import embed_texts

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 50 MB.")

    try:
        chunks = process_document(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to process document: {exc}")

    if not chunks:
        raise HTTPException(status_code=422, detail="No extractable text found in the document.")

    document_id = str(uuid.uuid4())
    collection = get_collection()
    uploaded_at = datetime.now(timezone.utc).isoformat()

    texts = [c["text"] for c in chunks]
    embeddings = embed_texts(texts)

    collection.add(
        ids=[f"{document_id}_{i}" for i in range(len(chunks))],
        embeddings=embeddings,
        documents=texts,
        metadatas=[
            {
                "document_id": document_id,
                "filename": file.filename,
                "page_number": c["page_number"],
                "uploaded_at": uploaded_at,
            }
            for c in chunks
        ],
    )

    return UploadResponse(
        document_id=document_id,
        filename=file.filename,
        chunks_created=len(chunks),
        message=f"'{file.filename}' processed into {len(chunks)} chunks successfully.",
    )


@router.get("/", response_model=list[DocumentMetadata])
async def list_documents():
    collection = get_collection()
    if collection.count() == 0:
        return []

    results = collection.get(include=["metadatas"])

    seen: dict[str, dict] = {}
    chunk_counts: dict[str, int] = {}

    for meta in results["metadatas"]:
        doc_id = meta.get("document_id", "")
        if doc_id:
            seen.setdefault(doc_id, meta)
            chunk_counts[doc_id] = chunk_counts.get(doc_id, 0) + 1

    return [
        DocumentMetadata(
            id=doc_id,
            filename=meta.get("filename", "Unknown"),
            file_type=Path(meta.get("filename", "")).suffix.lower(),
            chunk_count=chunk_counts.get(doc_id, 0),
            uploaded_at=meta.get("uploaded_at", ""),
        )
        for doc_id, meta in seen.items()
    ]


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    collection = get_collection()
    results = collection.get(where={"document_id": document_id}, include=["metadatas"])

    if not results["ids"]:
        raise HTTPException(status_code=404, detail="Document not found.")

    collection.delete(ids=results["ids"])
    return {"message": f"Deleted document and {len(results['ids'])} chunks."}
