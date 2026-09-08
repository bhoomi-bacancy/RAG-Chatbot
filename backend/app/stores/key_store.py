"""
Stores per-user provider API keys as JSON files in Supabase Storage bucket 'user-keys'.
No database migration required — the bucket is auto-created on first use.
"""
import json
from app.supabase_client import get_supabase

_BUCKET = "user-keys"
_bucket_ready = False


def _ensure_bucket() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    try:
        get_supabase().storage.create_bucket(_BUCKET, options={"public": False, "file_size_limit": 4096})
    except Exception:
        pass  # Already exists — fine
    _bucket_ready = True


def _path(user_id: str) -> str:
    return f"{user_id}.json"


def get_all_keys(user_id: str) -> dict:
    """Return full {provider: key} dict for user (empty if none saved or storage error)."""
    _ensure_bucket()
    try:
        data = get_supabase().storage.from_(_BUCKET).download(_path(user_id))
        return json.loads(data)
    except Exception:
        return {}


def save_user_key(user_id: str, provider: str, api_key: str) -> None:
    _ensure_bucket()
    keys = get_all_keys(user_id)
    keys[provider] = api_key
    content = json.dumps(keys).encode()
    # upsert=true overwrites existing file without needing a separate remove step
    get_supabase().storage.from_(_BUCKET).upload(
        _path(user_id),
        content,
        {"content-type": "application/json", "upsert": "true"},
    )


def get_user_key(user_id: str, provider: str) -> str | None:
    return get_all_keys(user_id).get(provider)


def list_key_providers(user_id: str) -> list[str]:
    return [k for k, v in get_all_keys(user_id).items() if v]


def delete_user_key(user_id: str, provider: str) -> None:
    _ensure_bucket()
    keys = get_all_keys(user_id)
    keys.pop(provider, None)
    content = json.dumps(keys).encode()
    if keys:
        get_supabase().storage.from_(_BUCKET).upload(
            _path(user_id),
            content,
            {"content-type": "application/json", "upsert": "true"},
        )
    else:
        try:
            get_supabase().storage.from_(_BUCKET).remove([_path(user_id)])
        except Exception:
            pass
