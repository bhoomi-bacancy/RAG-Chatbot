import chromadb
from app.config import settings
import os

_client = None
_collection = None


def init_db():
    global _client, _collection
    os.makedirs(settings.chroma_db_path, exist_ok=True)
    _client = chromadb.PersistentClient(path=settings.chroma_db_path)
    _collection = _client.get_or_create_collection(
        name="medical_documents",
        metadata={"hnsw:space": "cosine"},
    )


def get_collection():
    if _collection is None:
        init_db()
    return _collection


def get_client():
    if _client is None:
        init_db()
    return _client
