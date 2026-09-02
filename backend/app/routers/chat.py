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
        chunks = retrieve_chunks(
            query=request.message,
            document_ids=request.document_ids,
            user_id=uid,
        )
        history = [{"role": m.role, "content": m.content} for m in request.conversation_history]
        answer, confidence = generate_response(request.message, chunks, history)

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
        chunks = retrieve_chunks(
            query=request.message,
            document_ids=request.document_ids,
            user_id=uid,
        )
        history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

        # Auto-update chat title on first message
        if request.chat_id:
            chat = get_chat(uid, request.chat_id)
            if chat and chat.get("title") == "New Chat" and not chat.get("messages"):
                new_title = request.message[:60].strip()
                if new_title:
                    update_title(uid, request.chat_id, new_title)

        return StreamingResponse(
            stream_response(
                request.message,
                chunks,
                history,
                user_id=uid,
                chat_id=request.chat_id,
            ),
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
