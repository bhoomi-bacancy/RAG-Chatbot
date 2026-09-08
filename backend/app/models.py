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
    chat_id: Optional[str] = None
    model: Optional[str] = None
    user_api_key: Optional[str] = None


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
    duplicates_removed: int = 0
    message: str


class BatchFileResult(BaseModel):
    filename: str
    status: str  # "success" | "error" | "skipped"
    document_id: Optional[str] = None
    chunks_created: int = 0
    duplicates_removed: int = 0
    error: Optional[str] = None


class BatchUploadResponse(BaseModel):
    results: List[BatchFileResult]
    total_chunks: int
    total_duplicates_removed: int
    message: str


class UserCreate(BaseModel):
    email: str
    name: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    plan: str
    daily_usage: int
    daily_limit: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class ChatSession(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    document_ids: List[str] = []


class ChatSessionDetail(ChatSession):
    messages: List[ChatMessage] = []


class CreateChatRequest(BaseModel):
    title: str = "New Chat"


class RenameChatRequest(BaseModel):
    title: str
