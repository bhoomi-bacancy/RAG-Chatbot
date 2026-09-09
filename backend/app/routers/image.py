import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.auth_service import get_current_user
from app.config import settings

router = APIRouter()

FAL_MODEL = "fal-ai/qwen-image-edit-2511-multiple-angles"


class ImageEditRequest(BaseModel):
    image_url: str          # base64 data URL from frontend
    prompt: str             # camera descriptor, e.g. "front view eye-level shot medium shot"
    lora_scale: float = 0.9


def _call_fal(image_url: str, prompt: str, lora_scale: float) -> dict:
    import fal_client
    os_env_key = "FAL_KEY"
    import os
    os.environ.setdefault(os_env_key, settings.fal_api_key)
    result = fal_client.subscribe(
        FAL_MODEL,
        arguments={
            "image_url": image_url,
            "prompt": f"<sks> {prompt}",
            "lora_scale": lora_scale,
        },
    )
    return result


@router.post("/edit")
async def edit_image(
    request: ImageEditRequest,
    current_user: dict = Depends(get_current_user),
):
    if not settings.fal_api_key:
        raise HTTPException(status_code=503, detail="Image editing is not configured. Add FAL_API_KEY.")

    try:
        result = await asyncio.to_thread(_call_fal, request.image_url, request.prompt, request.lora_scale)
        images = result.get("images", [])
        if not images:
            raise HTTPException(status_code=500, detail="No image returned from the model.")
        return {"image_url": images[0]["url"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:300])
