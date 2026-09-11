"""
Run this to test Gemini directly: ! python test_gemini_httpx.py
It will show exactly what's failing — API key, model, or network.
"""
import os, sys, asyncio, json

# Load from .env
from dotenv import load_dotenv
load_dotenv()

# ── get key from storage (same as backend) ────────────────────────────────────
os.environ.setdefault("SUPABASE_URL",        os.getenv("SUPABASE_URL", ""))
os.environ.setdefault("SUPABASE_SERVICE_KEY", os.getenv("SUPABASE_SERVICE_KEY", ""))

API_KEY = sys.argv[1] if len(sys.argv) > 1 else None

if not API_KEY:
    # Try loading from storage
    try:
        sys.path.insert(0, ".")
        from app.stores.key_store import get_user_key

        # List files in the bucket to find a user
        from app.supabase_client import get_supabase
        sb = get_supabase()
        files = sb.storage.from_("user-keys").list()
        if files:
            first_file = files[0]["name"]  # e.g. "uuid.json"
            user_id = first_file.replace(".json", "")
            API_KEY = get_user_key(user_id, "google")
            if API_KEY:
                print(f"Found stored key for user {user_id[:8]}...: {API_KEY[:12]}...")
            else:
                print(f"No google key found for user {user_id[:8]}...")
        else:
            print("No files in user-keys bucket")
    except Exception as e:
        print(f"Could not load from storage: {e}")

if not API_KEY:
    print("Usage: python test_gemini_httpx.py <YOUR_GEMINI_KEY>")
    print("  OR just run without args if a key is already saved in Supabase storage")
    sys.exit(1)

MODEL = "gemini-2.0-flash"
print(f"\nTesting model: {MODEL}")
print(f"Key: {API_KEY[:12]}...")

# ── Test 1: simple non-streaming call ─────────────────────────────────────────
import httpx

print("\n=== Test 1: Non-streaming (generateContent) ===")
try:
    r = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        params={"key": API_KEY},
        json={"contents": [{"role": "user", "parts": [{"text": "Say 'hello world' only"}]}]},
        timeout=30,
    )
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        print(f"Response: {text.strip()}")
    else:
        print(f"Error: {r.text[:400]}")
except Exception as e:
    print(f"Exception: {type(e).__name__}: {e}")

# ── Test 2: streaming call ─────────────────────────────────────────────────────
print("\n=== Test 2: Streaming (streamGenerateContent?alt=sse) ===")

async def test_stream():
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream(
                "POST",
                f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:streamGenerateContent",
                params={"alt": "sse", "key": API_KEY},
                json={
                    "contents": [{"role": "user", "parts": [{"text": "Say 'hello world' only"}]}],
                    "generationConfig": {"maxOutputTokens": 50},
                },
            ) as response:
                print(f"Status: {response.status_code}")
                if response.status_code != 200:
                    body = await response.aread()
                    print(f"Error: {body.decode()[:400]}")
                    return

                tokens = []
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if not data:
                        continue
                    try:
                        chunk = json.loads(data)
                        candidates = chunk.get("candidates", [])
                        if candidates:
                            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            if text:
                                tokens.append(text)
                                print(f"  chunk: {repr(text)}")
                    except Exception:
                        pass

                print(f"Full response: {''.join(tokens)}")
                print("STREAMING OK" if tokens else "WARNING: No tokens received")
    except Exception as e:
        print(f"Exception: {type(e).__name__}: {e}")

asyncio.run(test_stream())
print("\nDone.")
