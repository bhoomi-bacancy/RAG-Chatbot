import asyncio
import json
from typing import List, AsyncIterator, Iterator, Optional

from groq import Groq, AsyncGroq
from app.config import settings

groq_client       = Groq(api_key=settings.groq_api_key)
async_groq_client = AsyncGroq(api_key=settings.groq_api_key)

_LANGUAGE_NAMES = {
    'en': 'English', 'hi': 'Hindi', 'es': 'Spanish',
    'fr': 'French',  'de': 'German', 'ar': 'Arabic',
}

def _language_instruction(language: Optional[str]) -> str:
    name = _LANGUAGE_NAMES.get(language or 'en', 'English')
    return (
        f"LANGUAGE RULE: Respond in {name} by default. "
        f"However, if the user explicitly asks for a different language in their message "
        f"(e.g. 'answer in French', 'give me the answer in Spanish', 'हिंदी में बताओ'), "
        f"respond in that requested language instead."
    )

def _system_with_context(language: Optional[str]) -> str:
    return f"""You are MedAssist, an intelligent document analysis assistant.

Retrieved document context is provided below. Follow these rules strictly:
1. ALWAYS analyze the retrieved document context thoroughly and in detail before answering.
2. If the answer is found in the document context: provide a detailed, comprehensive answer using all relevant information from the document. Cite the source filename in square brackets, e.g. [resume.pdf] or [report.pdf]. Do NOT give a brief answer — extract and present every relevant detail, section, value, and point from the document.
3. If the document context does not contain enough information: clearly state "This specific information was not found in the uploaded document(s)." then provide a helpful general answer based on your knowledge.
4. For clearly off-topic questions unrelated to documents (greetings, math, current date, etc.): answer directly without referencing the document.
- Structure your response clearly using headings, bullet points, and numbered lists where appropriate.
- For resumes: cover all sections — skills, experience, education, achievements, certifications.
- For medical reports: cover all findings, values, diagnoses, medications, and recommendations.
- For any document: be thorough — do not omit details that appear in the retrieved context.
- {_language_instruction(language)}"""

def _system_general(language: Optional[str]) -> str:
    return f"""You are MedAssist, a helpful AI assistant for medical documents.

Answer the user's question helpfully and clearly.
- Be clear, concise, and well-structured.
- For specific medical questions about a patient's report or test results, suggest uploading the relevant document for a more accurate, document-specific answer.
- {_language_instruction(language)}"""


# ── Provider routing ───────────────────────────────────────────────────────────

def get_provider(model: str) -> str:
    # Groq-namespaced models (groq/, openai/gpt-oss-*, qwen/, etc.) all go via Groq API
    if model.startswith("groq/"):       return "groq"
    if model.startswith("openai/"):     return "groq"   # gpt-oss-* are Groq-hosted
    if model.startswith("qwen/"):       return "groq"
    if model.startswith("meta-llama/"): return "groq"
    # User-provided keys for other providers
    if model.startswith("gpt-"):        return "openai"
    if model.startswith("claude-"):     return "anthropic"
    if model.startswith("gemini-"):     return "google"
    if model.startswith("ollama/"):     return "ollama"
    return "groq"


def _supports_vision(model: str, provider: str) -> bool:
    """Returns True only for models that accept multimodal (image) message content."""
    if provider == "anthropic": return True   # All Claude 3+ support vision
    if provider == "google":    return True   # All Gemini models support vision
    if provider == "openai":    return True   # GPT-4V and above support vision
    return False


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
    if provider == "ollama":    return _valid(settings.ollama_api_key) or "ollama"
    return None


# ── Multimodal helpers ─────────────────────────────────────────────────────────

def _parse_data_url(data_url: str):
    """Returns (media_type, base64_data) from a data: URL."""
    header, data = data_url.split(",", 1)
    media_type = header.split(":")[1].split(";")[0]
    return media_type, data


def _openai_to_anthropic_content(content):
    """Convert OpenAI multimodal content list → Anthropic format."""
    if isinstance(content, str):
        return content
    result = []
    for part in content:
        if part["type"] == "image_url":
            media_type, b64 = _parse_data_url(part["image_url"]["url"])
            result.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}})
        elif part["type"] == "text":
            result.append({"type": "text", "text": part["text"]})
    return result


def _openai_to_gemini_parts(content):
    """Convert OpenAI multimodal content → Gemini parts list."""
    if isinstance(content, str):
        return [{"text": content}]
    parts = []
    for part in content:
        if part["type"] == "image_url":
            media_type, b64 = _parse_data_url(part["image_url"]["url"])
            parts.append({"inlineData": {"mimeType": media_type, "data": b64}})
        elif part["type"] == "text":
            parts.append({"text": part["text"]})
    return parts


# ── Message builders ───────────────────────────────────────────────────────────

_CHUNK_CHAR_LIMIT = 1800     # default per-chunk cap
_SUMMARY_CHAR_LIMIT = 3500   # larger cap for summarisation queries
_SUMMARY_TRIGGERS = {
    "summarize", "summary", "summarise", "overview", "brief", "briefly",
    "describe", "explain", "what is this", "what does this", "tell me about",
    "key points", "main points", "highlights", "outline", "what happened",
    "what are the", "what is in", "give me",
}


def _is_summary_query(query: str) -> bool:
    q = query.lower()
    return any(t in q for t in _SUMMARY_TRIGGERS)


def build_context(chunks: List[dict], query: str = "") -> str:
    is_summary = _is_summary_query(query)
    max_chunks  = 15 if is_summary else 8
    char_limit  = _SUMMARY_CHAR_LIMIT if is_summary else _CHUNK_CHAR_LIMIT
    parts = []
    for chunk in chunks[:max_chunks]:
        text = chunk['text']
        if len(text) > char_limit:
            text = text[:char_limit] + "…"
        parts.append(f"[{chunk['filename']}, Page {chunk['page_number']}]\n{text}")
    return "\n\n---\n\n".join(parts)


def calculate_confidence(chunks: List[dict]) -> Optional[float]:
    if not chunks:
        return None
    scored = [c["similarity"] for c in chunks if c["similarity"] > 0]
    if not scored:
        return None
    top_scores = sorted(scored)[-3:]
    avg = sum(top_scores) / len(top_scores)
    normalized = min(avg / 0.30, 1.0)
    return round(normalized, 3)


def build_messages(query: str, chunks: List[dict], history: List[dict], language: Optional[str] = None, images: Optional[List[str]] = None) -> List[dict]:
    # Use document context whenever chunks exist — both FTS-matched (rank > 0) and
    # fallback chunks (rank = 0). The system prompt handles the "not found in document" case.
    use_doc_context = bool(chunks)

    if use_doc_context:
        system = _system_with_context(language)
        context = build_context(chunks, query)
        text_content = f"RETRIEVED CONTEXT:\n\n{context}\n\n---\n\nQUESTION: {query}"
    else:
        system = _system_general(language)
        text_content = query

    messages = [{"role": "system", "content": system}]
    # Keep up to 20 recent messages; older ones get tighter truncation to save tokens
    recent = history[-20:]
    for i, msg in enumerate(recent):
        content = msg["content"]
        max_len = 800 if i >= len(recent) - 6 else 350
        if len(content) > max_len:
            content = content[:max_len] + "…"
        messages.append({"role": msg["role"], "content": content})

    # Build last user message — multimodal if images attached
    if images:
        user_content = []
        for img_url in images[:4]:  # max 4 images
            user_content.append({"type": "image_url", "image_url": {"url": img_url}})
        user_content.append({"type": "text", "text": text_content})
    else:
        user_content = text_content

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
    msgs = []
    for m in messages:
        if m["role"] == "system":
            continue
        msgs.append({"role": m["role"], "content": _openai_to_anthropic_content(m["content"])})
    client = sdk.AsyncAnthropic(api_key=api_key)
    async with client.messages.stream(
        model=model, max_tokens=2048, system=system, messages=msgs
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def _stream_tokens_ollama(messages: List[dict], model: str, api_key: str) -> AsyncIterator[str]:
    from openai import AsyncOpenAI
    model_name = model.removeprefix("ollama/")
    client = AsyncOpenAI(base_url=settings.ollama_base_url, api_key=api_key)
    stream = await client.chat.completions.create(
        model=model_name, max_tokens=2048, messages=messages, stream=True
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def _stream_tokens_google(messages: List[dict], model: str, api_key: str) -> AsyncIterator[str]:
    """Direct httpx call to Gemini REST API — avoids google-generativeai SDK hanging in serverless."""
    import httpx, json as _json

    system = next((m["content"] for m in messages if m["role"] == "system"), "")
    msgs = [m for m in messages if m["role"] != "system"]
    contents = [
        {
            "role": "user" if m["role"] == "user" else "model",
            "parts": _openai_to_gemini_parts(m["content"]),
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

    # Separate connect vs read timeouts — images take longer to process before
    # the first byte arrives, but once streaming starts reads should be fast.
    timeout = httpx.Timeout(connect=15.0, read=50.0, write=30.0, pool=5.0)
    tokens_yielded = 0

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST", url,
            params={"alt": "sse", "key": api_key},
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise ValueError(f"Gemini API error {response.status_code}: {body.decode()[:300]}")

            async for line in response.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                # Handle both "data: {...}" (SSE) and raw "{...}" (NDJSON) formats
                if line.startswith("data:"):
                    line = line[5:].strip()
                if not line:
                    continue
                try:
                    chunk = _json.loads(line)
                    # Check for top-level API error
                    if chunk.get("error"):
                        raise ValueError(str(chunk["error"]))
                    candidates = chunk.get("candidates", [])
                    if not candidates:
                        fb = chunk.get("promptFeedback", {})
                        if fb.get("blockReason"):
                            raise ValueError(f"Content blocked by safety filter: {fb['blockReason']}")
                        continue
                    candidate = candidates[0]
                    # Safety block mid-stream
                    if candidate.get("finishReason") == "SAFETY":
                        raise ValueError("Response blocked by Gemini safety filter. Try rephrasing your request.")
                    text = (
                        candidate
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                    )
                    if text:
                        tokens_yielded += 1
                        yield text
                except (_json.JSONDecodeError, IndexError, KeyError):
                    pass

    if tokens_yielded == 0:
        raise ValueError("Gemini returned an empty response. The image may be unsupported or the request was blocked.")


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_response(
    query: str,
    chunks: List[dict],
    history: List[dict],
    model: Optional[str] = None,
    user_id: Optional[str] = None,
    language: Optional[str] = None,
    images: Optional[List[str]] = None,
) -> tuple[str, Optional[float]]:
    """Synchronous (non-streaming) response — used by the non-streaming endpoint."""
    model = model or settings.groq_model
    provider = get_provider(model)
    if images and not _supports_vision(model, provider):
        return (
            "⚠️ This model doesn't support image analysis. "
            "Please select GPT OSS 20B or 120B (Vision ✦ badge) from the model picker, "
            "or connect your OpenAI / Anthropic / Google account.",
            None,
        )
    messages = build_messages(query, chunks, history, language, images)
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

    if provider == "ollama":
        from openai import OpenAI
        model_name = model.removeprefix("ollama/")
        client = OpenAI(base_url=settings.ollama_base_url, api_key=api_key)
        resp = client.chat.completions.create(model=model_name, max_tokens=2048, messages=messages)
        return resp.choices[0].message.content, confidence

    if provider == "anthropic":
        import anthropic as sdk
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        msgs = [{"role": m["role"], "content": _openai_to_anthropic_content(m["content"])} for m in messages if m["role"] != "system"]
        client = sdk.Anthropic(api_key=api_key)
        resp = client.messages.create(model=model, max_tokens=2048, system=system, messages=msgs)
        return resp.content[0].text, confidence

    if provider == "google":
        import httpx, json as _json
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        msgs = [m for m in messages if m["role"] != "system"]
        contents = [
            {"role": "user" if m["role"] == "user" else "model", "parts": _openai_to_gemini_parts(m["content"])}
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
    language: Optional[str] = None,
    images: Optional[List[str]] = None,
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

    # If images were attached but the model can't handle them, explain and stop early
    if images and not _supports_vision(model, provider):
        err_msg = (
            "⚠️ **This model doesn't support image analysis.**\n\n"
            "To ask questions about images, please select a model with the **Vision ✦** badge "
            "(GPT OSS 20B or GPT OSS 120B) from the model picker, "
            "or connect your OpenAI / Anthropic / Google account."
        )
        yield f"data: {json.dumps({'type': 'token', 'data': err_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'confidence': None})}\n\n"
        return

    messages = build_messages(query, chunks, history, language, images)
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
        elif provider == "ollama":
            token_stream = _stream_tokens_ollama(messages, model, api_key)
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

        # Billing / quota exhausted — check FIRST so it doesn't fall into rate-limit or unknown
        _is_billing = (
            "insufficient_quota" in err_str or          # OpenAI: out of credits
            "exceeded your current quota" in err_str or  # OpenAI: free-tier exhausted
            "billing hard limit" in err_str or           # OpenAI: hard spend cap hit
            "insufficient_funds" in err_str or           # OpenAI / generic
            "payment required" in err_str or             # HTTP 402
            "402" in err_str or
            "credit balance" in err_str or               # Anthropic: low credit balance
            "credit_balance_too_low" in err_str or       # Anthropic error code
            "resource_exhausted" in err_str or           # Google: RESOURCE_EXHAUSTED
            "billing account" in err_str or              # Google: billing not set up
            ("quota" in err_str and "billing" in err_str)
        )

        # Auth errors: be specific — "invalid" alone matches invalid_request_error (model errors)
        _is_auth = (
            "401" in err_str or
            "invalid_api_key" in err_str or
            "unauthorized" in err_str or
            ("invalid" in err_str and "api key" in err_str)
        )

        if _is_billing:
            dashboard = {
                "openai":    "https://platform.openai.com/account/billing",
                "anthropic": "https://console.anthropic.com/settings/billing",
                "google":    "https://aistudio.google.com",
                "groq":      "https://console.groq.com",
            }.get(provider, f"the {provider.title()} dashboard")
            err_msg = (
                f"⚠️ Your {provider.title()} account has run out of credits or has a billing issue. "
                f"Please add credits or upgrade your plan at {dashboard}."
            )
        elif _is_auth:
            err_msg = f"⚠️ Your {provider.title()} API key is invalid or expired. Please reconnect in the model picker."
        elif "connection" in err_type or "apiconnection" in err_type or "connection error" in err_str:
            err_msg = f"⚠️ Could not connect to {provider.title()}. Check your network or try again."
        elif "429" in err_str or "rate limit" in err_str or "too many requests" in err_str:
            err_msg = f"⚠️ {provider.title()} rate limit reached. Please wait a moment and try again."
        elif "timeout" in err_str or "timed out" in err_str or "deadline" in err_str:
            err_msg = "⚠️ The request timed out. Please try again."
        elif "must be a string" in err_str or "content must be" in err_str or ("invalid" in err_str and "content" in err_str and "string" in err_str):
            err_msg = "⚠️ This model does not support image analysis. Please select GPT OSS 120B or connect an OpenAI / Anthropic / Google account for vision support."
        elif "413" in err_str or "request entity too large" in err_str or "payload too large" in err_str or "context_length_exceeded" in err_str or "maximum context" in err_str or "too many tokens" in err_str:
            err_msg = "⚠️ Your message or conversation history is too long for this model. Try starting a new chat or switching to a model with a larger context window."
        elif "not found" in err_str or "404" in err_str or "does not exist" in err_str or "model_not_found" in err_str or "decommissioned" in err_str or "deprecated" in err_str or "no longer" in err_str or ("invalid" in err_str and "model" in err_str):
            err_msg = f"⚠️ The model '{model}' is no longer available on {provider.title()}. Please select a different model."
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


async def translate_texts(texts: List[str], language: str) -> List[str]:
    """Translate a batch of texts to the target language using Groq."""
    if not texts:
        return []
    lang_name = _LANGUAGE_NAMES.get(language, 'English')
    if lang_name == 'English':
        return texts

    numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
    prompt = (
        f"Translate the following numbered texts to {lang_name}. "
        f"Return ONLY the translated items in the same numbered format (1. ... 2. ...). "
        f"Do not add explanations, notes, or change the numbering.\n\n{numbered}"
    )

    resp = await async_groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=4096,
    )
    result_text = resp.choices[0].message.content or ""

    translations: List[str] = []
    for i, original in enumerate(texts):
        prefix = f"{i + 1}."
        found = False
        for line in result_text.splitlines():
            stripped = line.strip()
            if stripped.startswith(prefix):
                translations.append(stripped[len(prefix):].strip())
                found = True
                break
        if not found:
            translations.append(original)

    return translations
