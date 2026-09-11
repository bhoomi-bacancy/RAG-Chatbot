"""
Tests the local backend stream endpoint.
Run: ! python test_stream_local.py
"""
import httpx, json, sys

BASE = "http://localhost:8001"

# ── 1. login to get token ─────────────────────────────────────────────────────
print("=== Logging in ===")
try:
    r = httpx.post(f"{BASE}/api/auth/login",
                   json={"email": "bhoomi.majethiya@bacancy.com", "password": "test1234"},
                   timeout=10)
    if r.status_code != 200:
        print(f"Login failed {r.status_code}: {r.text[:300]}")
        sys.exit(1)
    token = r.json()["access_token"]
    print(f"Got token: {token[:30]}...")
except Exception as e:
    print(f"Login error: {e}")
    sys.exit(1)

headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# ── 2. Test with Groq (should always work) ─────────────────────────────────────
print("\n=== Test 1: Groq streaming (compound-beta-mini) ===")
payload = {
    "message": "Say the word 'hello' and nothing else.",
    "model": "compound-beta-mini",
    "user_api_key": None,
    "conversation_history": [],
}
try:
    with httpx.stream("POST", f"{BASE}/api/chat/stream",
                      headers=headers, json=payload, timeout=30) as resp:
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"Error: {resp.read().decode()[:300]}")
        else:
            tokens, got_done = [], False
            for line in resp.iter_lines():
                if not line.startswith("data: "): continue
                try:
                    ev = json.loads(line[6:])
                    print(f"  event: {ev.get('type')} | {str(ev.get('data',''))[:60]}")
                    if ev["type"] == "token": tokens.append(ev["data"])
                    if ev["type"] == "done":  got_done = True; break
                except: pass
            print(f"Response: {''.join(tokens)}")
            print("PASS: got 'done'" if got_done else "FAIL: stream closed without 'done'")
except Exception as e:
    print(f"Exception: {type(e).__name__}: {e}")

# ── 3. Test Gemini with NULL key (should show key-missing error, not hang) ─────
print("\n=== Test 2: Gemini with NO key (should show error, not hang) ===")
payload2 = {
    "message": "Say hello.",
    "model": "gemini-2.0-flash",
    "user_api_key": None,
    "conversation_history": [],
}
try:
    with httpx.stream("POST", f"{BASE}/api/chat/stream",
                      headers=headers, json=payload2, timeout=20) as resp:
        print(f"Status: {resp.status_code}")
        got_done = False
        for line in resp.iter_lines():
            if not line.startswith("data: "): continue
            try:
                ev = json.loads(line[6:])
                print(f"  event: {ev.get('type')} | {str(ev.get('data',''))[:100]}")
                if ev["type"] == "done": got_done = True; break
            except: pass
        print("PASS: got 'done'" if got_done else "FAIL: stream closed without 'done'")
except Exception as e:
    print(f"Exception: {type(e).__name__}: {e}")

# ── 4. Test Gemini with FAKE key (should show auth error, not hang) ─────────────
print("\n=== Test 3: Gemini with FAKE key AIzaSy_fake (should show auth error) ===")
payload3 = {
    "message": "Say hello.",
    "model": "gemini-2.0-flash",
    "user_api_key": "AIzaSy_this_is_a_fake_key_to_test_error_handling",
    "conversation_history": [],
}
try:
    with httpx.stream("POST", f"{BASE}/api/chat/stream",
                      headers=headers, json=payload3, timeout=20) as resp:
        print(f"Status: {resp.status_code}")
        got_done = False
        for line in resp.iter_lines():
            if not line.startswith("data: "): continue
            try:
                ev = json.loads(line[6:])
                print(f"  event: {ev.get('type')} | {str(ev.get('data',''))[:100]}")
                if ev["type"] == "done": got_done = True; break
            except: pass
        print("PASS: got 'done'" if got_done else "FAIL: stream closed without 'done'")
except Exception as e:
    print(f"Exception: {type(e).__name__}: {e}")

print("\nDone.")
