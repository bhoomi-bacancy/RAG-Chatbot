from fastapi import APIRouter, HTTPException, Depends
from app.models import FolderPublic, FolderCreate, FolderRename
from app.stores.folder_store import list_folders, create_folder, rename_folder, delete_folder
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("/", response_model=list[FolderPublic])
async def get_folders(current_user: dict = Depends(get_current_user)):
    return list_folders(current_user["id"])


@router.post("/", response_model=FolderPublic)
async def post_folder(body: FolderCreate, current_user: dict = Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Folder name cannot be empty")
    return create_folder(current_user["id"], name)


@router.patch("/{folder_id}", response_model=FolderPublic)
async def patch_folder(folder_id: str, body: FolderRename, current_user: dict = Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Folder name cannot be empty")
    result = rename_folder(current_user["id"], folder_id, name)
    if not result:
        raise HTTPException(404, "Folder not found")
    return result


@router.delete("/{folder_id}")
async def del_folder(folder_id: str, current_user: dict = Depends(get_current_user)):
    delete_folder(current_user["id"], folder_id)
    return {"ok": True}
