import asyncio
import base64

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.auth_service import get_current_user
from app.config import settings

router = APIRouter()

# Primary model — short clips, fast generation
HF_VIDEO_PRIMARY = "https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b"
# Fallback model — same architecture, different instance
HF_VIDEO_FALLBACK = "https://api-inference.huggingface.co/models/ali-vilab/text-to-video-ms-1.7b"


class VideoGenerateRequest(BaseModel):
    prompt: str


def _hf_headers() -> dict:
    headers: dict = {"X-Wait-For-Model": "true"}
    if settings.hf_token:
        headers["Authorization"] = f"Bearer {settings.hf_token}"
    return headers


async def _call_hf_video(url: str, prompt: str, max_retries: int = 4) -> bytes:
    last_error = "Unknown error"

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        for attempt in range(max_retries):
            try:
                resp = await client.post(url, headers=_hf_headers(), json={"inputs": prompt})
            except httpx.TimeoutException:
                last_error = "Request timed out"
                await asyncio.sleep(10)
                continue

            ct = resp.headers.get("content-type", "")
            if resp.status_code == 200 and ("video" in ct or "octet-stream" in ct):
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
                wait = 15 + attempt * 10   # 15s, 25s, 35s, 45s
                last_error = f"Model busy (attempt {attempt + 1}/{max_retries}), retrying in {wait}s"
                await asyncio.sleep(wait)
                continue

            if resp.status_code == 429:
                raise HTTPException(status_code=429, detail="Rate limit reached. Wait a minute and try again.")

            last_error = f"HuggingFace returned {resp.status_code}: {body}"
            break

    raise HTTPException(status_code=503, detail=last_error)


@router.post("/generate")
async def generate_video(
    request: VideoGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a short video clip from a text prompt via HuggingFace (free)."""
    try:
        # Try primary model first, fall back to secondary if unavailable
        try:
            video_bytes = await _call_hf_video(HF_VIDEO_PRIMARY, request.prompt)
        except HTTPException as e:
            if e.status_code != 503:
                raise
            video_bytes = await _call_hf_video(HF_VIDEO_FALLBACK, request.prompt)

        out_b64 = base64.b64encode(video_bytes).decode()
        return {"video_url": f"data:video/mp4;base64,{out_b64}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:300])
