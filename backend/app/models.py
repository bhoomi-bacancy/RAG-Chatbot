from pydantic import BaseModel
from typing import List, Optional


class DocumentMetadata(BaseModel):
    id: str
    filename: str
    file_type: str
    chunk_count: int
    uploaded_at: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage] = []
    document_ids: Optional[List[str]] = None


class Source(BaseModel):
    document_id: str
    filename: str
    chunk_text: str
    similarity_score: float
    page_number: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[Source]
    confidence: float


class UploadResponse(BaseModel):
    document_id: str
    filename: str
    chunks_created: int
    message: str
