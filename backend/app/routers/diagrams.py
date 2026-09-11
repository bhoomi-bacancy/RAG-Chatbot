from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from groq import Groq
from app.config import settings
from app.services.auth_service import get_current_user

router = APIRouter()
_client = Groq(api_key=settings.groq_api_key)

_SYSTEM = """You are an expert Mermaid diagram generator specializing in medical and healthcare diagrams.

Rules:
- Return ONLY valid Mermaid diagram code. No explanation, no markdown code fences, no extra text.
- The output must start directly with the diagram type keyword (graph, sequenceDiagram, classDiagram, erDiagram, gantt, pie, etc.)
- Make diagrams clear, well-labeled, and medically accurate.
- Use descriptive node labels. For flowcharts use `graph TD` (top-down) by default.
- If the user asks to refine or modify existing code, return the complete updated Mermaid code.
- If the user's request is unclear, produce a sensible medical flowchart based on the topic.
"""


class DiagramRequest(BaseModel):
    prompt: str
    current_code: Optional[str] = None


class DiagramResponse(BaseModel):
    mermaid_code: str


@router.post("/generate", response_model=DiagramResponse)
async def generate_diagram(
    request: DiagramRequest,
    current_user: dict = Depends(get_current_user),
):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    user_msg = request.prompt.strip()
    if request.current_code and request.current_code.strip():
        user_msg = (
            f"Current diagram code:\n{request.current_code.strip()}\n\n"
            f"User request: {user_msg}"
        )

    try:
        resp = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2048,
            temperature=0.2,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": user_msg},
            ],
        )
        code = (resp.choices[0].message.content or "").strip()
        # Strip accidental markdown fences if the model adds them
        if code.startswith("```"):
            lines = code.splitlines()
            code = "\n".join(
                l for l in lines if not l.strip().startswith("```")
            ).strip()
        return DiagramResponse(mermaid_code=code)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Diagram generation failed: {exc}")
