from app.supabase_client import get_supabase


def create_chat(user_id: str, title: str = "New Chat") -> dict:
    sb = get_supabase()
    result = sb.table("chats").insert({
        "user_id": user_id,
        "title": title,
        "document_ids": [],
    }).execute()
    chat = result.data[0]
    return _format_chat(chat, [])


def list_chats(user_id: str) -> list:
    sb = get_supabase()
    result = sb.table("chats").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
    return [_format_chat(c, []) for c in (result.data or [])]


def get_chat(user_id: str, chat_id: str):
    sb = get_supabase()
    chat_result = sb.table("chats").select("*").eq("id", chat_id).eq("user_id", user_id).limit(1).execute()
    if not chat_result.data:
        return None
    chat = chat_result.data[0]
    msg_result = sb.table("messages").select("*").eq("chat_id", chat_id).order("created_at").execute()
    messages = msg_result.data or []
    return _format_chat(chat, messages)


def update_title(user_id: str, chat_id: str, title: str):
    from datetime import datetime, timezone
    sb = get_supabase()
    sb.table("chats").update({
        "title": title,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", chat_id).eq("user_id", user_id).execute()


def append_message(user_id: str, chat_id: str, role: str, content: str):
    from datetime import datetime, timezone
    sb = get_supabase()
    sb.table("messages").insert({
        "chat_id": chat_id,
        "role": role,
        "content": content,
    }).execute()
    sb.table("chats").update({
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", chat_id).execute()


def add_doc(user_id: str, chat_id: str, doc_id: str):
    from datetime import datetime, timezone
    sb = get_supabase()
    chat_result = sb.table("chats").select("document_ids").eq("id", chat_id).eq("user_id", user_id).limit(1).execute()
    if not chat_result.data:
        return
    current_ids: list = chat_result.data[0].get("document_ids") or []
    if doc_id not in current_ids:
        current_ids.append(doc_id)
        sb.table("chats").update({
            "document_ids": current_ids,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", chat_id).execute()


def delete_chat(user_id: str, chat_id: str):
    sb = get_supabase()
    sb.table("chats").delete().eq("id", chat_id).eq("user_id", user_id).execute()


# ── helpers ──────────────────────────────────────────────────────────────────

def _format_chat(chat: dict, messages: list) -> dict:
    return {
        "id": chat["id"],
        "title": chat["title"],
        "created_at": chat["created_at"],
        "updated_at": chat["updated_at"],
        "document_ids": chat.get("document_ids") or [],
        "messages": [
            {
                "role": m["role"],
                "content": m["content"],
                "timestamp": m.get("created_at", ""),
            }
            for m in messages
        ],
    }
