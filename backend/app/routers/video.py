import asyncio
import base64

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.auth_service import get_current_user
from app.config import settings

router = APIRouter()

HF_VIDEO_URL = "https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b"


class VideoGenerateRequest(BaseModel):
    prompt: str


def _hf_headers() -> dict:
    headers: dict = {"X-Wait-For-Model": "true"}
    if settings.hf_token:
        headers["Authorization"] = f"Bearer {settings.hf_token}"
    return headers


async def _generate_video(prompt: str, max_retries: int = 4) -> bytes:
    last_error = "Unknown error"

    async with httpx.AsyncClient(timeout=180, follow_redirects=True) as client:
        for attempt in range(max_retries):
            try:
                resp = await client.post(
                    HF_VIDEO_URL,
                    headers=_hf_headers(),
                    json={"inputs": prompt},
                )
            except httpx.TimeoutException:
                last_error = "Request timed out"
                await asyncio.sleep(15)
                continue

            ct = resp.headers.get("content-type", "")
            if resp.status_code == 200 and "video" in ct:
                return resp.content

            body = resp.text[:400]
            is_busy = (
                resp.status_code == 503
                or "loading" in body.lower()
                or "busy" in body.lower()
            )
            if is_busy:
                wait = 20 + attempt * 15
                last_error = f"Model busy (attempt {attempt + 1}/{max_retries}), retrying in {wait}s"
                await asyncio.sleep(wait)
                continue

            if resp.status_code == 429:
                raise HTTPException(status_code=429, detail="Rate limit reached. Wait a minute and try again.")

            last_error = f"HuggingFace returned {resp.status_code}: {body}"
            break

    raise HTTPException(
        status_code=503,
        detail=f"Video model unavailable after {max_retries} attempts: {last_error}",
    )


@router.post("/generate")
async def generate_video(
    request: VideoGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    # Generation is handled client-side via HuggingFace to avoid Vercel's 60s timeout
    raise HTTPException(status_code=501, detail="Use client-side generation.")
