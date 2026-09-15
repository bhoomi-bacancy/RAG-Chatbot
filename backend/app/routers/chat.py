import asyncio
import json
import traceback
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.models import ChatRequest, ChatResponse, Source, TranslateRequest, TranslateResponse, SuggestionsRequest, SuggestionsResponse
from app.services.auth_service import get_current_user
from app.services.retriever import retrieve_chunks
from app.services.generator import generate_response, stream_response, translate_texts
from app.stores.chat_store import get_chat, update_title
from app.stores.memory_store import get_memories

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
        try:
            memories = await asyncio.to_thread(get_memories, uid)
        except Exception as mem_err:
            print(f"[memory] Failed to fetch memories: {mem_err}")
            memories = []
        history = [{"role": m.role, "content": m.content} for m in request.conversation_history]
        answer, confidence = generate_response(request.message, chunks, history, model=request.model, user_id=uid, language=request.language, images=request.images, memories=memories)

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
        try:
            memories = await asyncio.to_thread(get_memories, uid)
        except Exception as mem_err:
            print(f"[memory] Failed to fetch memories: {mem_err}")
            memories = []
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
                    memories=memories,
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


@router.post("/suggestions", response_model=SuggestionsResponse)
async def get_suggestions(request: SuggestionsRequest, current_user: dict = Depends(get_current_user)):
    """Generate 3 follow-up question suggestions based on the last Q&A pair."""
    from groq import Groq
    from app.config import settings

    client = Groq(api_key=settings.groq_api_key)
    lang_map = {'en': 'English', 'hi': 'Hindi', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'ar': 'Arabic'}
    lang_name = lang_map.get(request.language or 'en', 'English')

    prompt = (
        f"Based on this medical Q&A, generate exactly 3 short follow-up questions a patient or clinician might ask next.\n\n"
        f"Q: {request.message[:300]}\nA: {request.response[:500]}\n\n"
        f"Rules:\n"
        f"- Return ONLY a numbered list: 1. ... 2. ... 3. ...\n"
        f"- Each question must be under 12 words\n"
        f"- Make them specific, medically relevant, and distinct\n"
        f"- Write in {lang_name}"
    )

    try:
        resp = client.chat.completions.create(
            model=settings.groq_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.7,
        )
        text = (resp.choices[0].message.content or "").strip()
        suggestions = []
        for line in text.splitlines():
            line = line.strip()
            if line and line[0].isdigit() and '.' in line:
                q = line.split('.', 1)[1].strip().strip('"').strip("'")
                if q:
                    suggestions.append(q)
        return SuggestionsResponse(suggestions=suggestions[:3])
    except Exception:
        return SuggestionsResponse(suggestions=[])


@router.post("/translate", response_model=TranslateResponse)
async def translate(request: TranslateRequest, current_user: dict = Depends(get_current_user)):
    if not request.texts:
        return TranslateResponse(translations=[])
    try:
        translations = await translate_texts(request.texts, request.language)
        return TranslateResponse(translations=translations)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
