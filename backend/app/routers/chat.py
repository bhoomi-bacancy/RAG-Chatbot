import json
import traceback
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.models import ChatRequest, ChatResponse, Source
from app.services.auth_service import get_current_user
from app.services.retriever import retrieve_chunks
from app.services.generator import generate_response, stream_response
from app.stores.chat_store import get_chat, update_title

router = APIRouter()


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    uid = current_user["id"]

    try:
        document_ids = request.document_ids
        if not document_ids and request.chat_id:
            chat_data = get_chat(uid, request.chat_id)
            if chat_data and chat_data.get("document_ids"):
                document_ids = chat_data["document_ids"]

        chunks = retrieve_chunks(
            query=request.message,
            document_ids=document_ids,
            user_id=uid,
        )
        history = [{"role": m.role, "content": m.content} for m in request.conversation_history]
        answer, confidence = generate_response(request.message, chunks, history, model=request.model, user_id=uid, language=request.language, images=request.images)

        sources = [
            Source(
                document_id=c["document_id"],
                filename=c["filename"],
                chunk_text=c["text"][:300] + "..." if len(c["text"]) > 300 else c["text"],
                similarity_score=c["similarity"],
                page_number=c["page_number"],
            )
            for c in chunks[:3]
        ]

        return ChatResponse(answer=answer, sources=sources, confidence=confidence)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def chat_stream(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    uid = current_user["id"]

    try:
        document_ids = request.document_ids
        chat_data = None
        if request.chat_id:
            chat_data = get_chat(uid, request.chat_id)
            if not document_ids and chat_data and chat_data.get("document_ids"):
                document_ids = chat_data["document_ids"]

        chunks = retrieve_chunks(
            query=request.message,
            document_ids=document_ids,
            user_id=uid,
        )
        history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

        # Auto-update chat title on first message
        if request.chat_id and chat_data:
            if chat_data.get("title") == "New Chat" and not chat_data.get("messages"):
                new_title = request.message[:60].strip()
                if new_title:
                    update_title(uid, request.chat_id, new_title)

        async def event_generator():
            sent_done = False
            try:
                async for chunk in stream_response(
                    request.message,
                    chunks,
                    history,
                    user_id=uid,
                    chat_id=request.chat_id,
                    model=request.model,
                    user_api_key=request.user_api_key,
                    language=request.language,
                    images=request.images,
                ):
                    if '"type": "done"' in chunk:
                        sent_done = True
                    yield chunk
            except Exception as gen_err:
                traceback.print_exc()
                err_msg = f"⚠️ Server error: {str(gen_err)[:100]}"
                yield f"data: {json.dumps({'type': 'token', 'data': err_msg})}\n\n"
            if not sent_done:
                yield f"data: {json.dumps({'type': 'done', 'confidence': None})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
