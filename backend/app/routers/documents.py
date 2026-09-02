from pathlib import Path
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.database import add_chunks, delete_chunks
from app.models import DocumentMetadata, UploadResponse
from app.services.auth_service import get_current_user
from app.services.document_processor import process_document
from app.services.embedder import embed_texts
from app.stores.chat_store import add_doc
from app.supabase_client import get_supabase

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    chat_id: str = Form(None),
    current_user: dict = Depends(get_current_user),
):
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
    user_id = current_user["id"]

    # Generate embeddings for all chunk texts
    texts = [c["text"] for c in chunks]
    embeddings = embed_texts(texts)

    # Store chunks + embeddings in Supabase
    chunk_records = [
        {
            "id": f"{document_id}_{i}",
            "document_id": document_id,
            "user_id": user_id,
            "filename": file.filename,
            "page_number": c["page_number"],
            "content": c["text"],
            "embedding": emb,
        }
        for i, (c, emb) in enumerate(zip(chunks, embeddings))
    ]
    add_chunks(chunk_records)

    # Save document metadata
    sb = get_supabase()
    sb.table("documents").insert(
        {
            "id": document_id,
            "user_id": user_id,
            "chat_id": chat_id or None,
            "filename": file.filename,
            "file_type": ext,
            "chunks_created": len(chunks),
        }
    ).execute()

    if chat_id:
        add_doc(user_id, chat_id, document_id)

    return UploadResponse(
        document_id=document_id,
        filename=file.filename,
        chunks_created=len(chunks),
        message=f"'{file.filename}' processed into {len(chunks)} chunks successfully.",
    )


@router.get("/", response_model=list[DocumentMetadata])
async def list_documents(current_user: dict = Depends(get_current_user)):
    sb = get_supabase()
    result = (
        sb.table("documents")
        .select("*")
        .eq("user_id", current_user["id"])
        .order("uploaded_at", desc=True)
        .execute()
    )
    return [
        DocumentMetadata(
            id=doc["id"],
            filename=doc["filename"],
            file_type=doc["file_type"],
            chunk_count=doc["chunks_created"],
            uploaded_at=doc["uploaded_at"],
        )
        for doc in (result.data or [])
    ]


@router.delete("/{document_id}")
async def delete_document(document_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]

    delete_chunks(document_id, user_id)

    sb = get_supabase()
    sb.table("documents").delete().eq("id", document_id).eq("user_id", user_id).execute()

    return {"message": "Deleted document and all its chunks."}
