from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import documents, chat, auth, chats

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


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy", "service": "Inkira RAG API"}
