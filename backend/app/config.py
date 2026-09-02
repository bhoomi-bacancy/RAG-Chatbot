from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    groq_api_key: str = ""
    groq_model: str = "groq/compound-mini"
    top_k: int = 5
    jwt_secret: str = "inkira-secret-key-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7
    free_daily_limit: int = 30
    supabase_url: str = ""
    supabase_service_key: str = ""
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
