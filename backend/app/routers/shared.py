import secrets

from fastapi import APIRouter, Depends, HTTPException

from app.models import ShareResponse, SharedChatResponse, SharedChatMessage
from app.services.auth_service import get_current_user
from app.supabase_client import get_supabase

router = APIRouter()


@router.post("/chats/{chat_id}", response_model=ShareResponse)
async def share_chat(chat_id: str, current_user: dict = Depends(get_current_user)):
    """Create or retrieve an existing share token for a chat."""
    user_id = current_user["id"]
    sb = get_supabase()

    # Verify chat belongs to this user
    chat = sb.table("chats").select("id").eq("id", chat_id).eq("user_id", user_id).execute()
    if not chat.data:
        raise HTTPException(status_code=404, detail="Chat not found.")

    # Return existing token if already shared
    existing = sb.table("shared_chats").select("token").eq("chat_id", chat_id).eq("user_id", user_id).execute()
    if existing.data:
        return ShareResponse(token=existing.data[0]["token"])

    # Create new token
    token = secrets.token_urlsafe(20)
    sb.table("shared_chats").insert({
        "token": token,
        "chat_id": chat_id,
        "user_id": user_id,
    }).execute()
    return ShareResponse(token=token)


@router.delete("/chats/{chat_id}")
async def unshare_chat(chat_id: str, current_user: dict = Depends(get_current_user)):
    """Remove the share token for a chat."""
    user_id = current_user["id"]
    sb = get_supabase()
    sb.table("shared_chats").delete().eq("chat_id", chat_id).eq("user_id", user_id).execute()
    return {"message": "Chat unshared."}


@router.get("/{token}", response_model=SharedChatResponse)
async def get_shared_chat(token: str):
    """Public endpoint — no auth required — returns messages for a shared chat."""
    sb = get_supabase()

    share = sb.table("shared_chats").select("*").eq("token", token).execute()
    if not share.data:
        raise HTTPException(status_code=404, detail="Shared chat not found.")

    record = share.data[0]
    chat_id = record["chat_id"]

    chat = sb.table("chats").select("title").eq("id", chat_id).execute()
    title = chat.data[0]["title"] if chat.data else "Shared Chat"

    msgs = sb.table("messages").select("role, content").eq("chat_id", chat_id).order("created_at").execute()
    messages = [SharedChatMessage(role=m["role"], content=m["content"]) for m in (msgs.data or [])]

    return SharedChatResponse(title=title, messages=messages)
