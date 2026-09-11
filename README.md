# MedAssist — Medical RAG Chatbot

A full-stack **Retrieval-Augmented Generation (RAG)** platform for medical document Q&A, built with FastAPI, React, Supabase, and Groq. Upload medical documents, ask questions, get cited answers in real time — plus an AI-powered diagram editor, image generation, and multi-language support.

**Live Demo:** [frontend-tau-blue-43.vercel.app](https://frontend-tau-blue-43.vercel.app)

---

## Screenshots

### Chat Interface
![Chat Interface](docs/screenshots/chat.png)

### Document Library
![Document Library](docs/screenshots/documents.png)

### Diagram Editor
![Diagram Editor](docs/screenshots/diagrams.png)

---

## Key Features

| Feature | Description |
|---|---|
| **Medical Document Q&A** | Upload PDF, DOCX, TXT, or JPG — ask questions and get cited answers |
| **Streaming Responses** | Answers stream token-by-token via SSE for instant feedback |
| **Source Citations** | Every answer links back to the exact document chunk and page number |
| **Conversation Memory** | Retains up to 20 messages of context for coherent follow-up questions |
| **Diagram Editor** | Mermaid live editor with 6 medical templates + AI generation from plain English |
| **Image Generation** | AI-powered image editing and generation |
| **Multi-language** | English, Hindi, Spanish, French, German, Arabic |
| **Mobile Responsive** | Full sidebar overlay, hamburger menu, touch-friendly on all screen sizes |
| **JWT Auth** | Register / login / password reset with secure token-based sessions |
| **Chat Organisation** | Folders, rename, delete, and time-grouped chat history |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    INGESTION PIPELINE                    │
│                                                          │
│  Upload (PDF/DOCX/TXT/JPG)                               │
│       │                                                  │
│       ▼                                                  │
│  Text Extraction  ──►  Chunking (500 chars, 100 overlap) │
│       │                                                  │
│       ▼                                                  │
│  Supabase — document_chunks table (PostgreSQL FTS index) │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                      QUERY PIPELINE                      │
│                                                          │
│  User Message                                            │
│       │                                                  │
│       ├─► document_ids in scope?                         │
│       │       │Yes → FTS search (search_document_chunks) │
│       │       │No  → skip retrieval → general answer     │
│       ▼                                                  │
│  Retrieved chunks  ──►  Groq LLM (streaming SSE)         │
│       │                                                  │
│       ▼                                                  │
│  Answer + Source citations + Confidence score            │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite + Tailwind CSS |
| **Backend** | Python 3.12 + FastAPI |
| **Database** | Supabase (PostgreSQL) — documents, chunks, chats, messages, users |
| **Search** | PostgreSQL Full-Text Search via `search_document_chunks` RPC |
| **LLM** | Groq — `llama-3.1-8b-instant` (default), model picker for OpenAI / Anthropic / Google |
| **Diagrams** | Mermaid.js (client-side rendering) + Groq for AI code generation |
| **Auth** | JWT (7-day expiry) + Google / Facebook / LinkedIn OAuth |
| **Streaming** | Server-Sent Events (SSE) |
| **Deployment** | Vercel (separate frontend + backend serverless functions) |
| **i18n** | react-i18next — 6 languages |

---

## Modules

### 1. Chat (`/api/chat`)
The core RAG engine. Each message:
- Resolves which documents are in scope for the current chat
- Runs PostgreSQL FTS only when documents are explicitly attached (never pollutes general conversations)
- Falls back to fetching first-N chunks when FTS finds no keyword match (handles summarisation queries)
- Streams the Groq response token-by-token via SSE
- Persists messages to Supabase for conversation history

### 2. Documents (`/api/documents`)
- Batch upload up to 10 files (PDF, DOCX, DOC, TXT, JPG)
- Content-hash deduplication — duplicate chunks are detected and skipped
- JPG images are OCR'd via Groq vision before chunking
- Documents are scoped to a chat (inline upload) or stored globally (Documents page)
- Delete document + all its chunks in one operation

### 3. Diagram Editor (`/api/diagrams`)
- Mermaid live editor with split-pane layout (code left, preview right)
- 6 starter templates: Flowchart, Sequence, Class Diagram, ER Diagram, Gantt, Pie
- AI generation: describe a diagram in plain English → Groq writes the Mermaid code
- AI refinement: follow-up prompts edit the existing diagram code
- Export to PNG (2× retina) or SVG
- 5 Mermaid themes: Default, Forest, Dark, Neutral, Base
- Real-time preview with 300 ms debounce and inline syntax error display

### 4. Image Generation (`/api/image`)
- AI image editing via fal.ai
- Free image generation via Hugging Face FLUX.1-schnell
- Client-side fetch to HuggingFace to avoid Vercel's 60 s function timeout

### 5. Auth (`/api/auth`)
- Email + password registration and login
- Password reset via email (SMTP)
- Google / Facebook / LinkedIn OAuth
- Avatar upload with client-side resize
- JWT with 7-day expiry, auto-logout on 401

### 6. Chats & Folders (`/api/chats`, `/api/folders`)
- Create, rename, delete chats
- Organise chats into folders with drag-to-assign
- Auto-title: first message becomes the chat title
- Time-grouped sidebar: Today / Yesterday / Previous 7 days / Older

### 7. Multi-Provider LLM (`/api/providers`)
- Model picker UI — switch between Groq, OpenAI, Anthropic, Google, Ollama
- User can store their own API keys (encrypted in Supabase)
- Platform keys used as fallback for shared deployments
- Vision models supported for image-in-chat

---

## Project Structure

```
medical-rag-chatbot/
├── backend/
│   ├── main.py                        # FastAPI app, CORS, router registration
│   ├── requirements.txt
│   ├── vercel.json                    # Serverless function config (60 s timeout)
│   └── app/
│       ├── config.py                  # Pydantic settings (reads env vars)
│       ├── models.py                  # Request / response Pydantic models
│       ├── database.py                # Supabase query helpers (FTS, fallback)
│       ├── supabase_client.py         # Supabase Python client singleton
│       ├── services/
│       │   ├── auth_service.py        # JWT decode, get_current_user dependency
│       │   ├── document_processor.py  # Extract → clean → chunk → hash
│       │   ├── retriever.py           # FTS retrieval + fallback logic
│       │   └── generator.py           # Prompt builder, SSE streamer, multi-provider
│       ├── routers/
│       │   ├── auth.py                # Register, login, OAuth, password reset
│       │   ├── chat.py                # Streaming + non-streaming chat
│       │   ├── chats.py               # Chat CRUD
│       │   ├── documents.py           # Upload (single + batch), list, delete
│       │   ├── diagrams.py            # AI Mermaid code generation
│       │   ├── image.py               # Image edit / generate
│       │   ├── folders.py             # Folder CRUD
│       │   └── providers.py           # Provider key management
│       └── stores/
│           ├── chat_store.py          # Supabase chat + message persistence
│           ├── user_store.py          # User profile helpers
│           └── key_store.py           # Encrypted API key storage
└── frontend/
    ├── src/
    │   ├── App.jsx                    # Root shell: auth guard, view routing
    │   ├── api/client.js              # Axios instance + SSE streamChat helper
    │   ├── contexts/AuthContext.jsx   # Auth state, login/logout/updateUser
    │   ├── components/
    │   │   ├── Sidebar.jsx            # Nav, chat list, folders, user profile
    │   │   ├── ChatWindow.jsx         # Message list, streaming, file attach
    │   │   ├── MessageBubble.jsx      # Message UI, source cards, confidence bar
    │   │   ├── ModelPickerModal.jsx   # Provider + model selection UI
    │   │   └── LanguagePicker.jsx     # i18n language switcher
    │   ├── pages/
    │   │   ├── AuthPage.jsx           # Login / register / forgot password
    │   │   ├── DocumentsPage.jsx      # Upload zone + document library
    │   │   ├── DiagramPage.jsx        # Mermaid editor + AI generation
    │   │   └── ImageEditPage.jsx      # Image generation / editing
    │   └── locales/                   # en, hi, es, fr, de, ar JSON strings
    └── vercel.json                    # SPA rewrite rule
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create a new user account |
| `POST` | `/api/auth/login` | Login, returns JWT |
| `POST` | `/api/auth/forgot-password` | Send password reset email |
| `POST` | `/api/auth/reset-password` | Set new password via reset token |
| `GET` | `/api/chats/` | List all chats for current user |
| `POST` | `/api/chats/` | Create a new chat |
| `DELETE` | `/api/chats/{id}` | Delete chat and its messages |
| `POST` | `/api/documents/upload` | Upload and chunk a single document |
| `POST` | `/api/documents/upload-batch` | Upload up to 10 documents |
| `GET` | `/api/documents/` | List all uploaded documents |
| `DELETE` | `/api/documents/{id}` | Delete document and all its chunks |
| `POST` | `/api/chat/stream` | **Streaming chat via SSE** |
| `POST` | `/api/diagrams/generate` | Generate Mermaid code from plain English |
| `POST` | `/api/image/generate` | Generate an image from a prompt |
| `GET` | `/health` | Health check |

### SSE Event Format (`/api/chat/stream`)

```
data: {"type": "sources", "data": [{...}]}   ← emitted first
data: {"type": "token",   "data": "Hello"}   ← one per token
data: {"type": "done",    "confidence": 0.82} ← final event
```

---

## Local Development

### Prerequisites
- Python 3.12+
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Groq](https://console.groq.com) API key (free tier works)

### 1. Clone

```bash
git clone https://github.com/bhoomi-bacancy/RAG-Chatbot.git
cd RAG-Chatbot
```

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_groq_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
JWT_SECRET=change_me_in_production
ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
```

```bash
uvicorn main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

```bash
npm run dev
```

Open `http://localhost:5173`

---

## Environment Variables

### Backend

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed frontend origins |
| `GROQ_MODEL` | No | Default LLM model (default: `llama-3.1-8b-instant`) |
| `SMTP_HOST` | No | SMTP host for password reset emails |
| `OPENAI_API_KEY` | No | Platform OpenAI key (optional) |
| `ANTHROPIC_API_KEY` | No | Platform Anthropic key (optional) |
| `GOOGLE_API_KEY` | No | Platform Google key (optional) |

### Frontend

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Backend API base URL |

---

## Supabase Schema

The app requires these tables in your Supabase project:

- **`users`** — email, name, password hash, avatar, reset tokens
- **`chats`** — title, user_id, document_ids[], folder_id
- **`messages`** — chat_id, role, content
- **`documents`** — filename, file_type, chunks_created, user_id, chat_id
- **`document_chunks`** — content, content_hash, document_id, user_id, page_number
- **`folders`** — name, user_id

A full-text search RPC `search_document_chunks(query_text, match_count, filter_user_id, filter_document_ids)` is required on `document_chunks`.

---

## License

MIT
