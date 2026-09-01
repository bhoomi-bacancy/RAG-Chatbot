from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models import ChatRequest, ChatResponse, Source
from app.services.retriever import retrieve_chunks
from app.services.generator import generate_response, stream_response

router = APIRouter()


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    chunks = retrieve_chunks(query=request.message, document_ids=request.document_ids)

    if not chunks:
        return ChatResponse(
            answer=(
                "I couldn't find relevant information in the uploaded documents. "
                "Please upload relevant medical documents and try again."
            ),
            sources=[],
            confidence=0.0,
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


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    chunks = retrieve_chunks(query=request.message, document_ids=request.document_ids)
    history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

    return StreamingResponse(
        stream_response(request.message, chunks, history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
