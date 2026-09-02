import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Inkira RAG API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health():
    # Test if env vars are available
    return {
        "status": "healthy",
        "groq_key_set": bool(os.getenv("GROQ_API_KEY")),
        "supabase_url_set": bool(os.getenv("SUPABASE_URL")),
    }
