import httpx
from app.config import settings

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


def embed_texts(texts: list[str]) -> list[list[float]]:
    response = httpx.post(
        "https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        json={"model": EMBEDDING_MODEL, "input": texts},
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()["data"]
    data.sort(key=lambda x: x["index"])
    return [item["embedding"] for item in data]


def embed_query(query: str) -> list[float]:
    return embed_texts([query])[0]
