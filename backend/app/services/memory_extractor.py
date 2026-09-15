"""Extract memorable facts from user messages and AI Q&A pairs."""
import json
from groq import Groq
from app.config import settings

_client = Groq(api_key=settings.groq_api_key)

_MSG_PROMPT = """\
Extract personal facts the user shared about themselves. Return a JSON array of concise strings.

Include: name, age, occupation, health conditions, medications, allergies, location, preferences.
Exclude: questions, generic statements, things that are not about the user personally.

Examples:
- "My name is Bhoomi" → ["User's name is Bhoomi"]
- "I am 30 with diabetes" → ["User is 30 years old", "User has diabetes"]
- "What is ibuprofen?" → []
- "I am a cardiologist" → ["User is a cardiologist"]

Return ONLY a JSON array. If nothing to remember, return [].

User message: {message}"""

_QA_PROMPT = """\
Extract facts worth remembering from this Q&A exchange. Return a JSON array of concise strings.

Include:
- User-specific data found in their documents (test results, values, diagnoses, prescriptions)
- Specific answers about the user's personal documents (e.g. blood pressure, lab values)
- Personal info the user revealed in their question

Exclude:
- Generic medical knowledge or explanations
- Document structure info (headings, page numbers)
- Anything not specific to this user

Examples:
- Q: "What is my blood pressure?" A: "Your BP is 120/80 per the report" → ["User's blood pressure is 120/80"]
- Q: "What medications am I on?" A: "You are prescribed Metformin 500mg" → ["User is prescribed Metformin 500mg"]
- Q: "Explain hypertension" A: "Hypertension is high blood pressure..." → []
- Q: "What are my cholesterol levels?" A: "LDL 180, HDL 45, Total 230" → ["User's LDL cholesterol is 180", "User's HDL cholesterol is 45", "User's total cholesterol is 230"]

Return ONLY a JSON array. If nothing user-specific to remember, return [].

User question: {message}
AI answer: {response}"""


def _parse_facts(raw: str) -> list[str]:
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        facts = json.loads(raw)
        if isinstance(facts, list):
            return [str(f).strip() for f in facts if str(f).strip()]
    except Exception:
        pass
    return []


def extract_facts(message: str) -> list[str]:
    """Extract personal facts from a single user message."""
    try:
        resp = _client.chat.completions.create(
            model=settings.groq_model,
            messages=[{"role": "user", "content": _MSG_PROMPT.format(message=message[:800])}],
            max_tokens=200,
            temperature=0.0,
        )
        return _parse_facts(resp.choices[0].message.content or "")
    except Exception as e:
        print(f"[memory] extract_facts failed: {e}")
    return []


def extract_facts_from_qa(message: str, response: str) -> list[str]:
    """Extract memorable facts from a full Q&A pair (user message + AI response)."""
    try:
        prompt = _QA_PROMPT.format(message=message[:600], response=response[:1000])
        resp = _client.chat.completions.create(
            model=settings.groq_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.0,
        )
        return _parse_facts(resp.choices[0].message.content or "")
    except Exception as e:
        print(f"[memory] extract_facts_from_qa failed: {e}")
    return []
