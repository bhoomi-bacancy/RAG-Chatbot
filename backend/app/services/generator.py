import asyncio
import json
from typing import List, AsyncIterator, Iterator, Optional

from groq import Groq, AsyncGroq
from app.config import settings

groq_client       = Groq(api_key=settings.groq_api_key)
async_groq_client = AsyncGroq(api_key=settings.groq_api_key)

SYSTEM_PROMPT_WITH_CONTEXT = """You are MedAssist, an intelligent medical Q&A assistant.

The user has uploaded documents. Answer using the retrieved context below.
- Cite sources using the document filename in square brackets, e.g. [casestudy.pdf].
- Be clear, concise, and well-structured.
- If the answer is not in the context, say so and answer from your general knowledge if possible."""

SYSTEM_PROMPT_GENERAL = """You are MedAssist, a helpful AI assistant for medical documents.

No documents have been uploaded yet. Answer the user's question using your general knowledge.
- Be clear, concise, and well-structured.
- If the user uploads documents, you will be able to give document-specific answers."""


# ── Provider routing ───────────────────────────────────────────────────────────

def get_provider(model: str) -> str:
    if model.startswith("gpt-"):      return "openai"
    if model.startswith("claude-"):   return "anthropic"
    if model.startswith("gemini-"):   return "google"
    return "groq"


_PLACEHOLDER_MARKERS = ("your-", "placeholder", "example", "changeme", "insert", "-here", "xxxxxxx")


def _platform_key(provider: str) -> Optional[str]:
    def _valid(key: str) -> Optional[str]:
        if not key:
            return None
        low = key.lower()
        if any(m in low for m in _PLACEHOLDER_MARKERS):
            return None
        return key

    if provider == "openai":    return _valid(settings.openai_api_key)
    if provider == "anthropic": return _valid(settings.anthropic_api_key)
    if provider == "google":    return _valid(settings.google_api_key)
    return None


# ── Message builders ───────────────────────────────────────────────────────────

def build_context(chunks: List[dict]) -> str:
    parts = []
    for chunk in chunks:
        parts.append(f"[{chunk['filename']}, Page {chunk['page_number']}]\n{chunk['text']}")
    return "\n\n---\n\n".join(parts)


def calculate_confidence(chunks: List[dict]) -> Optional[float]:
    if not chunks:
        return None
    avg = sum(c["similarity"] for c in chunks) / len(chunks)
    return round(min(avg, 1.0), 3)


def build_messages(query: str, chunks: List[dict], history: List[dict]) -> List[dict]:
    if chunks:
        system = SYSTEM_PROMPT_WITH_CONTEXT
        context = build_context(chunks)
        user_content = f"RETRIEVED CONTEXT:\n\n{context}\n\n---\n\nQUESTION: {query}"
    else:
        system = SYSTEM_PROMPT_GENERAL
        user_content = query

    messages = [{"role": "system", "content": system}]
    for msg in history[-6:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_content})
    return messages


# ── Async token streamers per provider ────────────────────────────────────────

async def _stream_tokens_groq(messages: List[dict], model: str) -> AsyncIterator[str]:
    stream = await async_groq_client.chat.completions.create(
        model=model, max_tokens=2048, messages=messages, stream=True
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def _stream_tokens_openai(messages: List[dict], model: str, api_key: str) -> AsyncIterator[str]:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    stream = await client.chat.completions.create(
        model=model, max_tokens=2048, messages=messages, stream=True
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def _stream_tokens_anthropic(messages: List[dict], model: str, api_key: str) -> AsyncIterator[str]:
    import anthropic as sdk
    system = next((m["content"] for m in messages if m["role"] == "system"), "")
    msgs = [m for m in messages if m["role"] != "system"]
    client = sdk.AsyncAnthropic(api_key=api_key)
    async with client.messages.stream(
        model=model, max_tokens=2048, system=system, messages=msgs
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def _stream_tokens_google(messages: List[dict], model: str, api_key: str) -> AsyncIterator[str]:
    """Direct httpx call to Gemini REST API — avoids google-generativeai SDK hanging in serverless."""
    import httpx, json as _json

    system = next((m["content"] for m in messages if m["role"] == "system"), "")
    msgs = [m for m in messages if m["role"] != "system"]
    contents = [
        {
            "role": "user" if m["role"] == "user" else "model",
            "parts": [{"text": m["content"]}],
        }
        for m in msgs
    ]

    payload: dict = {
        "contents": contents,
        "generationConfig": {"maxOutputTokens": 2048},
    }
    if system:
        payload["system_instruction"] = {"parts": [{"text": system}]}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"

    async with httpx.AsyncClient(timeout=55.0) as client:
        async with client.stream(
            "POST", url,
            params={"alt": "sse", "key": api_key},
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise ValueError(f"Gemini API error {response.status_code}: {body.decode()[:300]}")

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if not data:
                    continue
                try:
                    chunk = _json.loads(data)
                    candidates = chunk.get("candidates", [])
                    if not candidates:
                        fb = chunk.get("promptFeedback", {})
                        if fb.get("blockReason"):
                            raise ValueError(f"Content blocked by safety filter: {fb['blockReason']}")
                        continue
                    text = (
                        candidates[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                    )
                    if text:
                        yield text
                except (_json.JSONDecodeError, IndexError, KeyError):
                    pass


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_response(
    query: str,
    chunks: List[dict],
    history: List[dict],
    model: Optional[str] = None,
    user_id: Optional[str] = None,
) -> tuple[str, Optional[float]]:
    """Synchronous (non-streaming) response — used by the non-streaming endpoint."""
    model = model or settings.groq_model
    provider = get_provider(model)
    messages = build_messages(query, chunks, history)
    confidence = calculate_confidence(chunks)

    if provider == "groq":
        resp = groq_client.chat.completions.create(
            model=model, max_tokens=2048, messages=messages
        )
        return resp.choices[0].message.content, confidence

    api_key = _platform_key(provider)
    if not api_key:
        return (f"⚠️ {provider.title()} models are not configured on this platform yet.", confidence)

    if provider == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(model=model, max_tokens=2048, messages=messages)
        return resp.choices[0].message.content, confidence

    if provider == "anthropic":
        import anthropic as sdk
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        msgs = [m for m in messages if m["role"] != "system"]
        client = sdk.Anthropic(api_key=api_key)
        resp = client.messages.create(model=model, max_tokens=2048, system=system, messages=msgs)
        return resp.content[0].text, confidence

    if provider == "google":
        import httpx, json as _json
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        msgs = [m for m in messages if m["role"] != "system"]
        contents = [
            {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
            for m in msgs
        ]
        payload: dict = {"contents": contents, "generationConfig": {"maxOutputTokens": 2048}}
        if system:
            payload["system_instruction"] = {"parts": [{"text": system}]}
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        r = httpx.post(url, params={"key": api_key}, json=payload, timeout=55.0)
        r.raise_for_status()
        data = r.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return text, confidence

    return "Unknown provider.", confidence


async def stream_response(
    query: str,
    chunks: List[dict],
    history: List[dict],
    user_id: Optional[str] = None,
    chat_id: Optional[str] = None,
    model: Optional[str] = None,
    user_api_key: Optional[str] = None,
) -> AsyncIterator[str]:
    """Async generator — yields SSE-formatted strings."""
    model = model or settings.groq_model
    provider = get_provider(model)

    # 1. Emit sources immediately
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

    # 2. Resolve API key: request key > stored key > platform key
    api_key = None
    if provider != "groq":
        if user_api_key and user_api_key not in ("platform", "oauth", ""):
            api_key = user_api_key
            print(f"[stream] Using request-provided key for {provider}")

        if not api_key and user_id:
            try:
                from app.stores.key_store import get_user_key
                stored = await asyncio.to_thread(get_user_key, user_id, provider)
                if stored and stored not in ("platform", "oauth", ""):
                    api_key = stored
                    print(f"[stream] Using stored key for {provider}")
            except Exception as key_err:
                print(f"[stream] Key retrieval failed for {provider}: {key_err}")

        if not api_key:
            api_key = _platform_key(provider)
            if api_key:
                print(f"[stream] Using platform key for {provider}")

        if not api_key:
            print(f"[stream] No API key found for {provider}")
            msg = (
                f"⚠️ No API key found for {provider.title()}. "
                f"Open the model picker and connect your {provider.title()} account."
            )
            yield f"data: {json.dumps({'type': 'token', 'data': msg})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'confidence': None})}\n\n"
            return

    print(f"[stream] Starting {provider}/{model}")

    # 3. Stream tokens
    # Validate Groq key before trying (empty key → APIConnectionError, not auth error)
    if provider == "groq" and not settings.groq_api_key:
        print("[stream] GROQ_API_KEY is not set in environment")
        yield f"data: {json.dumps({'type': 'token', 'data': '⚠️ Groq API key is not configured on this server. Please set GROQ_API_KEY in Vercel environment variables.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'confidence': None})}\n\n"
        return

    full_response = ""
    try:
        if provider == "groq":
            token_stream = _stream_tokens_groq(messages, model)
        elif provider == "openai":
            token_stream = _stream_tokens_openai(messages, model, api_key)
        elif provider == "anthropic":
            token_stream = _stream_tokens_anthropic(messages, model, api_key)
        elif provider == "google":
            token_stream = _stream_tokens_google(messages, model, api_key)
        else:
            token_stream = (t async for t in [])

        async for token in token_stream:
            full_response += token
            yield f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"

        print(f"[stream] Done — {len(full_response)} chars from {provider}/{model}")

    except Exception as e:
        print(f"[stream] Provider error ({provider}/{model}): {type(e).__name__}: {e}")
        err_str = str(e).lower()
        err_type = type(e).__name__.lower()
        if "401" in err_str or "invalid" in err_str or "api key" in err_str or "unauthorized" in err_str or "authentication" in err_str:
            err_msg = f"⚠️ Your {provider.title()} API key is invalid or expired. Please reconnect in the model picker."
        elif "connection" in err_type or "apiconnection" in err_type or "connection error" in err_str:
            err_msg = f"⚠️ Could not connect to {provider.title()}. Check that GROQ_API_KEY is set in your Vercel environment variables."
        elif "429" in err_str or "rate limit" in err_str or "quota" in err_str:
            err_msg = f"⚠️ {provider.title()} rate limit reached. Please try again in a moment."
        elif "timeout" in err_str or "timed out" in err_str or "deadline" in err_str:
            err_msg = "⚠️ The request timed out. Please try again."
        elif "not found" in err_str or "404" in err_str or "does not exist" in err_str:
            err_msg = f"⚠️ Model not found. Please select a different {provider.title()} model."
        else:
            err_msg = f"⚠️ {provider.title()} error ({type(e).__name__}): {str(e)[:120]}"
        yield f"data: {json.dumps({'type': 'token', 'data': err_msg})}\n\n"

    # 4. Persist messages (wrapped — failure must not prevent 'done' from being sent)
    if user_id and chat_id and full_response:
        try:
            from app.stores.chat_store import append_message
            await asyncio.to_thread(append_message, user_id, chat_id, "user", query)
            await asyncio.to_thread(append_message, user_id, chat_id, "assistant", full_response)
        except Exception as persist_err:
            print(f"[stream] Message persistence failed: {persist_err}")

    yield f"data: {json.dumps({'type': 'done', 'confidence': confidence})}\n\n"
