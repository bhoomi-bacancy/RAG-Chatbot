from fastapi import APIRouter, HTTPException, Depends
from app.models import ChatSession, ChatSessionDetail, CreateChatRequest, RenameChatRequest, ChatMessage
from app.stores.chat_store import create_chat, list_chats, get_chat, delete_chat, update_title
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("/", response_model=list[ChatSession])
async def get_chats(current_user: dict = Depends(get_current_user)):
    chats = list_chats(current_user["id"])
    return [
        ChatSession(
            id=c["id"],
            title=c["title"],
            created_at=c["created_at"],
            updated_at=c["updated_at"],
            document_ids=c.get("document_ids", []),
        )
        for c in chats
    ]


@router.post("/", response_model=ChatSession)
async def new_chat(body: CreateChatRequest, current_user: dict = Depends(get_current_user)):
    chat = create_chat(current_user["id"], body.title)
    return ChatSession(
        id=chat["id"],
        title=chat["title"],
        created_at=chat["created_at"],
        updated_at=chat["updated_at"],
        document_ids=chat.get("document_ids", []),
    )


@router.get("/{chat_id}", response_model=ChatSessionDetail)
async def get_chat_detail(chat_id: str, current_user: dict = Depends(get_current_user)):
    chat = get_chat(current_user["id"], chat_id)
    if not chat:
        raise HTTPException(404, "Chat not found")
    return ChatSessionDetail(
        id=chat["id"],
        title=chat["title"],
        created_at=chat["created_at"],
        updated_at=chat["updated_at"],
        document_ids=chat.get("document_ids", []),
        messages=[
            ChatMessage(role=m["role"], content=m["content"])
            for m in chat.get("messages", [])
        ],
    )


@router.patch("/{chat_id}", response_model=ChatSession)
async def rename_chat(chat_id: str, body: RenameChatRequest, current_user: dict = Depends(get_current_user)):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title cannot be empty.")
    uid = current_user["id"]
    chat = get_chat(uid, chat_id)
    if not chat:
        raise HTTPException(404, "Chat not found")
    update_title(uid, chat_id, title)
    chat = get_chat(uid, chat_id)
    return ChatSession(
        id=chat["id"],
        title=chat["title"],
        created_at=chat["created_at"],
        updated_at=chat["updated_at"],
        document_ids=chat.get("document_ids", []),
    )


@router.delete("/{chat_id}")
async def remove_chat(chat_id: str, current_user: dict = Depends(get_current_user)):
    delete_chat(current_user["id"], chat_id)
    return {"message": "Chat deleted"}
