import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.services.auth_service import get_current_user
from app.stores.memory_store import get_memories_with_ids, add_memory, delete_memory, clear_memories

router = APIRouter()


class AddMemoryBody(BaseModel):
    memory: str


class ExtractBody(BaseModel):
    message: str
    response: str = ""   # AI response — when provided, extract from full Q&A pair


@router.post("/extract")
async def extract_and_save(body: ExtractBody, current_user: dict = Depends(get_current_user)):
    """Extract facts from a user message (and optionally the AI response) and save them."""
    if not body.message.strip():
        return {"saved": 0}
    uid = current_user["id"]
    try:
        from app.services.memory_extractor import extract_facts, extract_facts_from_qa

        if body.response.strip():
            # Extract from full Q&A pair — captures document-specific answers too
            facts = await asyncio.to_thread(extract_facts_from_qa, body.message.strip(), body.response.strip())
        else:
            facts = await asyncio.to_thread(extract_facts, body.message.strip())

        for fact in facts:
            await asyncio.to_thread(add_memory, uid, fact)
        if facts:
            print(f"[memory] Saved {len(facts)} fact(s) for {uid}: {facts}")
        return {"saved": len(facts), "facts": facts}
    except Exception as e:
        print(f"[memory] Extract endpoint error: {e}")
        return {"saved": 0}


@router.get("/")
async def list_memories(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    items = get_memories_with_ids(uid)
    return {"memories": items}


@router.post("/")
async def create_memory(body: AddMemoryBody, current_user: dict = Depends(get_current_user)):
    if not body.memory.strip():
        raise HTTPException(status_code=400, detail="Memory text cannot be empty.")
    add_memory(current_user["id"], body.memory.strip())
    return {"ok": True}


@router.delete("/")
async def clear_all_memories(current_user: dict = Depends(get_current_user)):
    clear_memories(current_user["id"])
    return {"ok": True}


@router.delete("/{memory_id}")
async def remove_memory(memory_id: str, current_user: dict = Depends(get_current_user)):
    delete_memory(current_user["id"], memory_id)
    return {"ok": True}
