import json
from typing import List, Iterator, Optional
from groq import Groq
from app.config import settings

client = Groq(api_key=settings.groq_api_key)

SYSTEM_PROMPT_WITH_CONTEXT = """You are Inkira, an intelligent Q&A assistant.

The user has uploaded documents. Answer using the retrieved context below.
- Reference sources using [Source N] notation.
- Be clear, concise, and well-structured.
- If the answer is not in the context, say so and answer from your general knowledge if possible."""

SYSTEM_PROMPT_GENERAL = """You are Inkira, a helpful AI assistant.

No documents have been uploaded yet. Answer the user's question using your general knowledge.
- Be clear, concise, and well-structured.
- If the user uploads documents, you will be able to give document-specific answers."""


def build_context(chunks: List[dict]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"[Source {i}: {chunk['filename']}, Page {chunk['page_number']}]\n{chunk['text']}"
        )
    return "\n\n---\n\n".join(parts)


def calculate_confidence(chunks: List[dict]) -> Optional[float]:
    if not chunks:
        return None  # general knowledge — no document confidence to report
    avg = sum(c["similarity"] for c in chunks) / len(chunks)
    return round(min(avg, 1.0), 3)


def build_messages(query: str, chunks: List[dict], history: List[dict]) -> List[dict]:
    if chunks:
        system = SYSTEM_PROMPT_WITH_CONTEXT
        context = build_context(chunks)
        user_content = (
            f"RETRIEVED CONTEXT:\n\n{context}\n\n"
            f"---\n\nQUESTION: {query}"
        )
    else:
        system = SYSTEM_PROMPT_GENERAL
        user_content = query

    messages = [{"role": "system", "content": system}]
    for msg in history[-6:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_content})
    return messages


def generate_response(query: str, chunks: List[dict], history: List[dict]) -> tuple[str, float]:
    messages = build_messages(query, chunks, history)

    response = client.chat.completions.create(
        model=settings.groq_model,
        max_tokens=2048,
        messages=messages,
    )

    answer = response.choices[0].message.content
    confidence = calculate_confidence(chunks)
    return answer, confidence


def stream_response(
    query: str,
    chunks: List[dict],
    history: List[dict],
    user_id: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> Iterator[str]:
    sources_payload = [
        {
            "document_id": c["document_id"],
            "filename": c["filename"],
            "chunk_text": c["text"][:300] + "..." if len(c["text"]) > 300 else c["text"],
            "similarity_score": c["similarity"],
            "page_number": c["page_number"],
        }
        for c in chunks[:3]
    ]

    yield f"data: {json.dumps({'type': 'sources', 'data': sources_payload})}\n\n"

    messages = build_messages(query, chunks, history)
    confidence = calculate_confidence(chunks)

    stream = client.chat.completions.create(
        model=settings.groq_model,
        max_tokens=2048,
        messages=messages,
        stream=True,
    )

    full_response = ""
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            full_response += delta
            yield f"data: {json.dumps({'type': 'token', 'data': delta})}\n\n"

    # Persist messages to chat session when chat_id is provided
    if user_id and chat_id and full_response:
        from app.stores.chat_store import append_message
        append_message(user_id, chat_id, "user", query)
        append_message(user_id, chat_id, "assistant", full_response)

    yield f"data: {json.dumps({'type': 'done', 'confidence': confidence})}\n\n"
