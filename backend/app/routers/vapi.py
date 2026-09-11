import json
from typing import Optional, List
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.auth_service import decode_token
from app.services.retriever import retrieve_chunks
from app.services.generator import stream_response

router = APIRouter()


class VapiMessage(BaseModel):
    role: str
    content: str


class VapiChatRequest(BaseModel):
    model: Optional[str] = "medical-rag"
    messages: List[VapiMessage]
    stream: Optional[bool] = True
    max_tokens: Optional[int] = None


@router.post("/chat/completions")
async def vapi_chat(
    request: VapiChatRequest,
    authorization: Optional[str] = Header(None),
):
    """OpenAI-compatible completions endpoint consumed by Vapi Custom LLM."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    token = authorization.split(" ", 1)[1]
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_msgs = [m for m in request.messages if m.role == "user"]
    if not user_msgs:
        raise HTTPException(status_code=400, detail="No user message")

    last_msg = user_msgs[-1].content.strip()
    history = [
        {"role": m.role, "content": m.content}
        for m in request.messages[:-1]
        if m.role in ("user", "assistant")
    ]

    chunks = retrieve_chunks(query=last_msg, user_id=user_id)

    async def openai_stream():
        cid = "chatcmpl-vapi"
        async for sse_line in stream_response(last_msg, chunks, history, user_id=user_id):
            if not sse_line.startswith("data: "):
                continue
            try:
                payload = json.loads(sse_line[6:])
                if payload.get("type") == "token":
                    yield f"data: {json.dumps({'id': cid, 'object': 'chat.completion.chunk', 'choices': [{'index': 0, 'delta': {'content': payload['data']}, 'finish_reason': None}]})}\n\n"
                elif payload.get("type") == "done":
                    yield f"data: {json.dumps({'id': cid, 'object': 'chat.completion.chunk', 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]})}\n\n"
                    yield "data: [DONE]\n\n"
            except Exception:
                pass

    return StreamingResponse(
        openai_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
