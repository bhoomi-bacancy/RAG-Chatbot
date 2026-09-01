from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"
    embedding_model: str = "all-MiniLM-L6-v2"
    chroma_db_path: str = "./data/chroma_db"
    chunk_size: int = 512
    chunk_overlap: int = 64
    top_k: int = 5

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
