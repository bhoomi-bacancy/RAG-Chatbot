from pydantic import BaseModel
from typing import List, Optional


class DocumentMetadata(BaseModel):
    id: str
    filename: str
    file_type: str
    chunk_count: int
    uploaded_at: Optional[str] = None


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
    language: Optional[str] = None  # BCP-47 code: 'en', 'hi', 'es', 'fr', 'de', 'ar'
    images: Optional[List[str]] = None  # base64 data URLs, e.g. "data:image/jpeg;base64,..."


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
    avatar_url: Optional[str] = None


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
    folder_id: Optional[str] = None


class FolderPublic(BaseModel):
    id: str
    name: str
    created_at: str


class FolderCreate(BaseModel):
    name: str


class FolderRename(BaseModel):
    name: str


class ChatSessionDetail(ChatSession):
    messages: List[ChatMessage] = []


class CreateChatRequest(BaseModel):
    title: str = "New Chat"


class RenameChatRequest(BaseModel):
    title: str


class MoveChatFolderRequest(BaseModel):
    folder_id: Optional[str] = None


class AvatarUpdateRequest(BaseModel):
    avatar_url: str


class GoogleAuthRequest(BaseModel):
    access_token: str

class FacebookAuthRequest(BaseModel):
    access_token: str

class InstagramAuthRequest(BaseModel):
    access_token: str  # Meta/Facebook access token

class LinkedInAuthRequest(BaseModel):
    code: str
    redirect_uri: str

class TranslateRequest(BaseModel):
    texts: List[str]
    language: str  # BCP-47 code: 'en', 'hi', 'es', 'fr', 'de', 'ar'

class TranslateResponse(BaseModel):
    translations: List[str]


class SuggestionsRequest(BaseModel):
    message: str
    response: str
    language: Optional[str] = None


class SuggestionsResponse(BaseModel):
    suggestions: List[str]


class DocumentSummaryResponse(BaseModel):
    summary: str


class ShareResponse(BaseModel):
    token: str


class SharedChatMessage(BaseModel):
    role: str
    content: str


class SharedChatResponse(BaseModel):
    title: str
    messages: List[SharedChatMessage]
