import asyncio
import base64

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.auth_service import get_current_user
from app.config import settings

router = APIRouter()

# InstructPix2Pix — instruction-based image editing, free on HF Inference API
HF_PIX2PIX_URL = "https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix"
# Fallback: Stable Diffusion img2img
HF_SD15_URL    = "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5"


# ── request models ─────────────────────────────────────────────────────────────

class ImageEditRequest(BaseModel):
    image_url: str   # base64 data URL from frontend
    prompt: str      # natural language instruction


class ImageGenerateRequest(BaseModel):
    prompt: str
    image_size: str = "square"


# ── helpers ────────────────────────────────────────────────────────────────────

def _hf_headers(wait_for_model: bool = True) -> dict:
    headers: dict = {"Content-Type": "image/jpeg"}
    if settings.hf_token:
        headers["Authorization"] = f"Bearer {settings.hf_token}"
    if wait_for_model:
        # Tells HF to wait for model to load instead of returning 503/busy
        headers["X-Wait-For-Model"] = "true"
    return headers


def _b64_to_bytes(data_url: str) -> bytes:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return base64.b64decode(data_url)


async def _hf_img2img(url: str, img_bytes: bytes, prompt: str, max_retries: int = 4) -> bytes:
    """
    POST binary image to HuggingFace img2img endpoint.
    Uses X-Wait-For-Model to avoid Errno 16 / device busy on cold models.
    """
    headers = _hf_headers(wait_for_model=True)
    params = {"prompt": prompt}
    last_error = "Unknown error"

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        for attempt in range(max_retries):
            try:
                resp = await client.post(url, headers=headers, params=params, content=img_bytes)
            except httpx.TimeoutException:
                last_error = "Request timed out"
                await asyncio.sleep(10)
                continue

            ct = resp.headers.get("content-type", "")
            if resp.status_code == 200 and "image" in ct:
                return resp.content

            body = resp.text[:400]
            is_busy = (
                resp.status_code == 503
                or "Errno 16" in body
                or "busy" in body.lower()
                or "loading" in body.lower()
                or "currently loading" in body.lower()
            )
            if is_busy:
                # Exponential-ish backoff: 15s, 25s, 40s
                wait = 15 + attempt * 10
                last_error = f"Model busy (attempt {attempt + 1}/{max_retries}), retrying in {wait}s"
                await asyncio.sleep(wait)
                continue

            if resp.status_code == 429:
                raise HTTPException(status_code=429, detail="Rate limit reached. Wait a minute and try again.")

            if resp.status_code == 400:
                raise HTTPException(status_code=400, detail=f"Bad request: {body}")

            last_error = f"HuggingFace returned {resp.status_code}: {body}"
            break

    raise HTTPException(
        status_code=503,
        detail=f"Image model unavailable after {max_retries} attempts: {last_error}",
    )


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/edit")
async def edit_image(
    request: ImageEditRequest,
    current_user: dict = Depends(get_current_user),
):
    """Edit image with text instruction — InstructPix2Pix via HuggingFace (free)."""
    try:
        img_bytes = _b64_to_bytes(request.image_url)

        # Try primary model (InstructPix2Pix)
        try:
            result_bytes = await _hf_img2img(HF_PIX2PIX_URL, img_bytes, request.prompt)
        except HTTPException as primary_err:
            if primary_err.status_code != 503:
                raise
            # Fallback to SD 1.5 img2img
            result_bytes = await _hf_img2img(HF_SD15_URL, img_bytes, request.prompt)

        out_b64 = base64.b64encode(result_bytes).decode()
        return {"image_url": f"data:image/jpeg;base64,{out_b64}"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:300])


@router.post("/generate")
async def generate_image(
    request: ImageGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    # Generation is handled client-side via Pollinations.ai
    raise HTTPException(status_code=501, detail="Use client-side generation.")
