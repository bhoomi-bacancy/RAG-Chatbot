import json
from typing import List, Iterator
import anthropic
from app.config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """You are MedAssist, an expert medical information assistant powered by RAG (Retrieval-Augmented Generation).

Your role is to provide accurate, evidence-based medical information strictly from the provided document context.

Guidelines:
- Answer ONLY based on the retrieved context. If the answer is not found, say so clearly.
- Always cite the source document(s) in your answer using [Source N] notation.
- Use clear, professional medical language while remaining accessible to patients.
- For serious medical concerns, always recommend consulting a licensed healthcare professional.
- Never diagnose conditions or prescribe treatments — you provide information only.
- Structure complex answers with clear headings and bullet points for readability.
- Be thorough but concise."""


def build_context(chunks: List[dict]) -> str:
    if not chunks:
        return "No relevant context found in the uploaded documents."
    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"[Source {i}: {chunk['filename']}, Page {chunk['page_number']}]\n{chunk['text']}"
        )
    return "\n\n---\n\n".join(parts)


def calculate_confidence(chunks: List[dict]) -> float:
    if not chunks:
        return 0.0
    avg = sum(c["similarity"] for c in chunks) / len(chunks)
    return round(min(avg * 1.15, 1.0), 3)


def build_messages(query: str, context: str, history: List[dict]) -> List[dict]:
    messages = []
    for msg in history[-6:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    user_content = (
        f"RETRIEVED CONTEXT FROM MEDICAL DOCUMENTS:\n\n{context}\n\n"
        f"---\n\nQUESTION: {query}\n\n"
        "Please answer based solely on the context above. "
        "If the information is not present, clearly state that."
    )
    messages.append({"role": "user", "content": user_content})
    return messages


def generate_response(query: str, chunks: List[dict], history: List[dict]) -> tuple[str, float]:
    context = build_context(chunks)
    messages = build_messages(query, context, history)

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    answer = response.content[0].text
    confidence = calculate_confidence(chunks)
    return answer, confidence


def stream_response(query: str, chunks: List[dict], history: List[dict]) -> Iterator[str]:
    """Yields SSE-formatted strings for streaming."""
    sources_payload = []
    for chunk in chunks[:3]:
        text = chunk["text"]
        sources_payload.append(
            {
                "document_id": chunk["document_id"],
                "filename": chunk["filename"],
                "chunk_text": text[:300] + "..." if len(text) > 300 else text,
                "similarity_score": chunk["similarity"],
                "page_number": chunk["page_number"],
            }
        )

    yield f"data: {json.dumps({'type': 'sources', 'data': sources_payload})}\n\n"

    if not chunks:
        no_doc_msg = (
            "I couldn't find relevant information in the uploaded documents. "
            "Please upload relevant medical documents first."
        )
        yield f"data: {json.dumps({'type': 'token', 'data': no_doc_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'confidence': 0.0})}\n\n"
        return

    context = build_context(chunks)
    messages = build_messages(query, context, history)
    confidence = calculate_confidence(chunks)

    with client.messages.stream(
        model=settings.claude_model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {json.dumps({'type': 'token', 'data': text})}\n\n"

    yield f"data: {json.dumps({'type': 'done', 'confidence': confidence})}\n\n"
