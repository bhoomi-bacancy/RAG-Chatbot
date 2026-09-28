from fastapi import APIRouter, HTTPException

from app.models import SharedChatResponse, SharedChatMessage
from app.supabase_client import get_supabase

router = APIRouter()


@router.get("/{chat_id}", response_model=SharedChatResponse)
async def get_shared_chat(chat_id: str):
    """Public endpoint — no auth required — returns messages for a chat by ID."""
    sb = get_supabase()

    chat = sb.table("chats").select("title").eq("id", chat_id).execute()
    if not chat.data:
        raise HTTPException(status_code=404, detail="Chat not found.")

    title = chat.data[0]["title"]
    msgs = sb.table("messages").select("role, content").eq("chat_id", chat_id).order("created_at").execute()
    messages = [SharedChatMessage(role=m["role"], content=m["content"]) for m in (msgs.data or [])]

    return SharedChatResponse(title=title, messages=messages)
