from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import documents, chat

app = FastAPI(
    title="MedAssist RAG API",
    description="Medical RAG Chatbot — document upload, semantic search, and Claude-powered generation.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()


app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy", "service": "MedAssist RAG API"}
