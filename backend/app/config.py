from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"
    top_k: int = 15
    chunk_size: int = 500
    chunk_overlap: int = 100
    jwt_secret: str = "inkira-secret-key-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7
    free_daily_limit: int = 30
    supabase_url: str = ""
    supabase_service_key: str = ""
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    # Email / SMTP settings
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Frontend / Backend URLs
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"

    # Platform API keys (used server-side for all users)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""

    # Ollama (OpenAI-compatible local or hosted)
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_api_key: str = ""

    # fal.ai — image editing via Qwen LoRA
    fal_api_key: str = ""

    # HuggingFace — free image generation (FLUX.1-schnell)
    hf_token: str = ""

    # Google OAuth credentials (for "Sign in with Google")
    google_client_id: str = ""
    google_client_secret: str = ""

    # Facebook OAuth credentials (for "Sign in with Facebook" / Instagram)
    facebook_app_id: str = ""
    facebook_app_secret: str = ""

    # LinkedIn OAuth credentials
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
