import os
from pathlib import Path

# Load .env only in local development (file won't exist on Vercel)
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_file)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import documents, chat, auth, chats, providers

app = FastAPI(
    title="Inkira RAG API",
    description="Document Q&A chatbot — upload any document, ask anything.",
    version="2.0.0",
)

origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(chats.router, prefix="/api/chats", tags=["Chats"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(providers.router, prefix="/api/providers", tags=["Providers"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy", "service": "Inkira RAG API"}


@app.get("/health/env", tags=["Health"])
async def health_env():
    """Shows which required environment variables are set (not their values)."""
    from app.config import settings
    return {
        "GROQ_API_KEY":          bool(settings.groq_api_key),
        "SUPABASE_URL":          bool(settings.supabase_url),
        "SUPABASE_SERVICE_KEY":  bool(settings.supabase_service_key),
        "JWT_SECRET_custom":     settings.jwt_secret != "inkira-secret-key-change-in-prod",
        "ALLOWED_ORIGINS":       settings.allowed_origins,
        "FRONTEND_URL":          settings.frontend_url,
        "OPENAI_API_KEY":        bool(settings.openai_api_key),
        "ANTHROPIC_API_KEY":     bool(settings.anthropic_api_key),
        "GOOGLE_API_KEY":        bool(settings.google_api_key),
    }
