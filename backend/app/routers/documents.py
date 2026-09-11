import base64
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.database import add_chunks, delete_chunks
from app.models import DocumentMetadata, UploadResponse, BatchUploadResponse, BatchFileResult
from app.services.auth_service import get_current_user
from app.services.document_processor import process_document, deduplicate_chunks
from app.stores.chat_store import add_doc
from app.supabase_client import get_supabase

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
BATCH_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".jpg", ".jpeg"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg"}
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4 MB — Vercel serverless hard limit is 4.5 MB
MAX_BATCH_FILES = 10


def _fetch_existing_hashes(user_id: str) -> set:
    """Fetch up to 1000 content hashes already stored for this user."""
    try:
        sb = get_supabase()
        result = (
            sb.table("document_chunks")
            .select("content_hash")
            .eq("user_id", user_id)
            .not_.is_("content_hash", "null")
            .limit(1000)
            .execute()
        )
        return {row["content_hash"] for row in (result.data or []) if row.get("content_hash")}
    except Exception:
        return set()


def _ocr_image(file_bytes: bytes, content_type: str) -> List[dict]:
    """OCR a standalone image file using Groq vision and return chunk list."""
    try:
        from app.config import settings
        from groq import Groq

        client = Groq(api_key=settings.groq_api_key)
        encoded = base64.b64encode(file_bytes).decode("utf-8")
        mime = "image/png" if content_type == ".png" else "image/jpeg"
        response = client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{encoded}"},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extract all text from this image exactly as it appears. "
                            "Return only the extracted text, no explanations."
                        ),
                    },
                ],
            }],
            max_tokens=4096,
        )
        text = (response.choices[0].message.content or "").strip()
        if not text:
            return []
        import hashlib
        h = hashlib.md5(text.lower().strip().encode()).hexdigest()
        return [{"text": text, "page_number": 1, "content_hash": h}]
    except Exception as exc:
        raise ValueError(f"OCR failed: {exc}")


def _save_document(
    *,
    user_id: str,
    chat_id: str | None,
    filename: str,
    file_type: str,
    chunks: List[dict],
    document_id: str,
) -> None:
    chunk_records = [
        {
            "id": f"{document_id}_{i}",
            "document_id": document_id,
            "user_id": user_id,
            "filename": filename,
            "page_number": c["page_number"],
            "content": c["text"],
            "content_hash": c.get("content_hash"),
        }
        for i, c in enumerate(chunks)
    ]
    add_chunks(chunk_records)

    sb = get_supabase()
    sb.table("documents").insert({
        "id": document_id,
        "user_id": user_id,
        "chat_id": chat_id or None,
        "filename": filename,
        "file_type": file_type,
        "chunks_created": len(chunks),
    }).execute()

    if chat_id:
        try:
            add_doc(user_id, chat_id, document_id)
        except Exception:
            pass


# ── Single upload (original endpoint, kept for backwards compatibility) ────────

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
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 4 MB.")

    try:
        all_chunks = process_document(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to process document: {exc}")

    if not all_chunks:
        raise HTTPException(status_code=422, detail="No extractable text found in the document.")

    user_id = current_user["id"]
    existing_hashes = _fetch_existing_hashes(user_id)
    unique_chunks = deduplicate_chunks(all_chunks, existing_hashes)
    duplicates_removed = len(all_chunks) - len(unique_chunks)

    if not unique_chunks:
        raise HTTPException(
            status_code=422,
            detail="All content in this document already exists in your knowledge base.",
        )

    document_id = str(uuid.uuid4())
    try:
        _save_document(
            user_id=user_id,
            chat_id=chat_id,
            filename=file.filename,
            file_type=ext,
            chunks=unique_chunks,
            document_id=document_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database error: {exc}")

    return UploadResponse(
        document_id=document_id,
        filename=file.filename,
        chunks_created=len(unique_chunks),
        duplicates_removed=duplicates_removed,
        message=f"'{file.filename}' processed into {len(unique_chunks)} chunks successfully."
        + (f" ({duplicates_removed} duplicate chunks removed.)" if duplicates_removed else ""),
    )


# ── Batch upload ──────────────────────────────────────────────────────────────

@router.post("/upload-batch", response_model=BatchUploadResponse)
async def upload_batch(
    files: List[UploadFile] = File(...),
    chat_id: str = Form(None),
    current_user: dict = Depends(get_current_user),
):
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(400, f"Maximum {MAX_BATCH_FILES} files per batch.")

    user_id = current_user["id"]
    existing_hashes = _fetch_existing_hashes(user_id)
    batch_hashes: set = set()  # accumulate within this batch for cross-doc dedup

    results: List[BatchFileResult] = []
    total_chunks = 0
    total_dupes = 0

    for upload in files:
        ext = Path(upload.filename).suffix.lower()
        if ext not in BATCH_ALLOWED_EXTENSIONS:
            results.append(BatchFileResult(
                filename=upload.filename,
                status="error",
                error=f"Unsupported file type '{ext}'.",
            ))
            continue

        file_bytes = await upload.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            results.append(BatchFileResult(
                filename=upload.filename,
                status="error",
                error="File too large (max 4 MB).",
            ))
            continue

        try:
            if ext in IMAGE_EXTENSIONS:
                all_chunks = _ocr_image(file_bytes, ext)
            else:
                all_chunks = process_document(file_bytes, upload.filename)
        except Exception as exc:
            results.append(BatchFileResult(
                filename=upload.filename,
                status="error",
                error=str(exc),
            ))
            continue

        if not all_chunks:
            results.append(BatchFileResult(
                filename=upload.filename,
                status="error",
                error="No extractable text found.",
            ))
            continue

        combined_existing = existing_hashes | batch_hashes
        unique_chunks = deduplicate_chunks(all_chunks, combined_existing)
        dupes = len(all_chunks) - len(unique_chunks)

        if not unique_chunks:
            results.append(BatchFileResult(
                filename=upload.filename,
                status="skipped",
                duplicates_removed=dupes,
                error="All content already exists in your knowledge base.",
            ))
            total_dupes += dupes
            continue

        document_id = str(uuid.uuid4())
        try:
            _save_document(
                user_id=user_id,
                chat_id=chat_id,
                filename=upload.filename,
                file_type=ext,
                chunks=unique_chunks,
                document_id=document_id,
            )
        except Exception as exc:
            results.append(BatchFileResult(
                filename=upload.filename,
                status="error",
                error=f"Database error: {exc}",
            ))
            continue

        # Add new hashes to the batch set for subsequent files
        for c in unique_chunks:
            if c.get("content_hash"):
                batch_hashes.add(c["content_hash"])

        results.append(BatchFileResult(
            filename=upload.filename,
            status="success",
            document_id=document_id,
            chunks_created=len(unique_chunks),
            duplicates_removed=dupes,
        ))
        total_chunks += len(unique_chunks)
        total_dupes += dupes

    success_count = sum(1 for r in results if r.status == "success")
    return BatchUploadResponse(
        results=results,
        total_chunks=total_chunks,
        total_duplicates_removed=total_dupes,
        message=f"{success_count}/{len(files)} files processed successfully.",
    )


# ── List & Delete ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[DocumentMetadata])
async def list_documents(current_user: dict = Depends(get_current_user)):
    sb = get_supabase()
    result = (
        sb.table("documents")
        .select("*")
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return [
        DocumentMetadata(
            id=doc["id"],
            filename=doc["filename"],
            file_type=doc.get("file_type", ""),
            chunk_count=doc.get("chunks_created", 0),
            uploaded_at=doc.get("uploaded_at") or doc.get("created_at"),
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
