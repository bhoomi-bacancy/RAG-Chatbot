from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    groq_api_key: str = ""
    supabase_url: str = ""
    allowed_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"

settings = Settings()

app = FastAPI(title="Inkira RAG API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health():
    return {"status": "healthy", "groq_key_set": bool(settings.groq_api_key)}
