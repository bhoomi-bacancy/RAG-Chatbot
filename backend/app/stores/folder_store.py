from app.supabase_client import get_supabase


def list_folders(user_id: str) -> list:
    sb = get_supabase()
    result = sb.table("folders").select("*").eq("user_id", user_id).order("created_at").execute()
    return [_fmt(f) for f in (result.data or [])]


def create_folder(user_id: str, name: str) -> dict:
    sb = get_supabase()
    result = sb.table("folders").insert({"user_id": user_id, "name": name}).execute()
    return _fmt(result.data[0])


def rename_folder(user_id: str, folder_id: str, name: str):
    sb = get_supabase()
    result = sb.table("folders").update({"name": name}).eq("id", folder_id).eq("user_id", user_id).execute()
    if not result.data:
        return None
    return _fmt(result.data[0])


def delete_folder(user_id: str, folder_id: str) -> bool:
    sb = get_supabase()
    sb.table("chats").update({"folder_id": None}).eq("folder_id", folder_id).eq("user_id", user_id).execute()
    sb.table("folders").delete().eq("id", folder_id).eq("user_id", user_id).execute()
    return True


def _fmt(f: dict) -> dict:
    return {"id": f["id"], "name": f["name"], "created_at": f.get("created_at", "")}
