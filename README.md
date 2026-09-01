# MedAssist — Medical RAG Chatbot

An end-to-end **Retrieval-Augmented Generation (RAG)** system for medical document Q&A, built with FastAPI, React, ChromaDB, sentence-transformers, and Claude claude-sonnet-4-6.

Upload medical PDFs, DOCX files, or text — then ask questions and get accurate, cited answers in real time via streaming.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         INGESTION PIPELINE                       │
│                                                                   │
│  Document Upload ──► Text Extraction ──► Sentence-Aware          │
│  (PDF/DOCX/TXT)       (pypdf/docx)       Chunking (512 tokens,   │
│                                           64-token overlap)       │
│                              │                                    │
│                              ▼                                    │
│                    Embed with                                     │
│                    all-MiniLM-L6-v2  ──► ChromaDB (cosine index) │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          QUERY PIPELINE                          │
│                                                                   │
│  User Query ──► Embed query ──► Cosine similarity search         │
│                                 (ChromaDB, top-5 chunks)         │
│                                        │                         │
│                                        ▼                         │
│                             Build prompt with                     │
│                             retrieved context                    │
│                                        │                         │
│                                        ▼                         │
│                         Claude claude-sonnet-4-6 (streaming SSE) │
│                                        │                         │
│                                        ▼                         │
│                    Answer + Source citations + Confidence score  │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Python 3.11 + FastAPI |
| Embeddings | `sentence-transformers` — `all-MiniLM-L6-v2` (local, free) |
| Vector Store | ChromaDB (file-based persistence, cosine similarity) |
| LLM | Anthropic Claude claude-sonnet-4-6 |
| Document Parsing | `pypdf` (PDF), `python-docx` (DOCX), built-in (TXT) |
| Streaming | Server-Sent Events (SSE) |
| Containerisation | Docker + Docker Compose |

### Key Design Decisions

- **Local embeddings** — `all-MiniLM-L6-v2` runs entirely on CPU, so there is no embedding API cost.
- **Sentence-aware chunking** — splits at sentence boundaries before applying a fixed word-count ceiling, preserving medical terminology context across chunk borders.
- **Streaming responses** — tokens are streamed via SSE so users see answers character-by-character instead of waiting for the full response.
- **Source citations** — every assistant message links back to the exact chunk (document name + page number + similarity score) that informed the answer.
- **Confidence scoring** — derived from the average cosine similarity of the retrieved chunks, displayed as a colour-coded progress bar.
- **Conversation memory** — the last 6 turns of chat history are injected into the prompt so follow-up questions are handled naturally.

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- An **Anthropic API key** — get one at <https://console.anthropic.com>

---

## Quick Start (Local Development)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/medical-rag-chatbot.git
cd medical-rag-chatbot
```

### 2. Backend setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Open .env and set ANTHROPIC_API_KEY=your_key_here

# Start the API server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

### 3. Frontend setup

```bash
cd frontend

npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Docker (Production)

```bash
# In the project root, create a .env file:
echo "ANTHROPIC_API_KEY=your_key_here" > .env

docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`

---

## Usage

1. **Upload a document** — drag and drop (or click) a PDF, DOCX, or TXT file in the left sidebar.
2. **Ask a question** — type in the chat box and press Enter (or click Send).
3. **View sources** — click "Show N sources" below any assistant response to see the exact passages used.
4. **Filter by document** — check one or more documents in the sidebar to restrict retrieval to those files only.
5. **Clear chat** — use the "Clear" button in the header to start a fresh conversation.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents/upload` | Upload and index a document |
| `GET` | `/api/documents/` | List all uploaded documents |
| `DELETE` | `/api/documents/{id}` | Delete a document and its chunks |
| `POST` | `/api/chat/` | Non-streaming chat (returns full response) |
| `POST` | `/api/chat/stream` | **Streaming chat via SSE** |
| `GET` | `/health` | Health check |

### SSE Event Format

The `/api/chat/stream` endpoint emits three event types:

```
data: {"type": "sources", "data": [{...}, ...]}   ← sent first

data: {"type": "token",   "data": "Hello"}         ← repeated per token

data: {"type": "done",    "confidence": 0.82}      ← final event
```

---

## Project Structure

```
medical-rag-chatbot/
├── backend/
│   ├── main.py                        # FastAPI app + CORS + router wiring
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── app/
│       ├── config.py                  # Pydantic settings (reads .env)
│       ├── models.py                  # Request/response Pydantic models
│       ├── database.py                # ChromaDB client + collection init
│       ├── services/
│       │   ├── document_processor.py  # Extract → clean → chunk
│       │   ├── embedder.py            # sentence-transformers wrapper
│       │   ├── retriever.py           # Cosine similarity search
│       │   └── generator.py           # Claude prompt builder + SSE streamer
│       └── routers/
│           ├── documents.py           # Upload / list / delete endpoints
│           └── chat.py                # Chat + streaming endpoints
├── frontend/
│   ├── src/
│   │   ├── App.jsx                    # Root layout (sidebar + chat)
│   │   ├── api/client.js              # axios + SSE fetch helpers
│   │   └── components/
│   │       ├── Sidebar.jsx            # Document list, upload zone, filter
│   │       ├── UploadZone.jsx         # react-dropzone with progress bar
│   │       ├── ChatWindow.jsx         # Message list, streaming, input area
│   │       └── MessageBubble.jsx      # Message UI + source cards + confidence
│   └── ...config files
├── docker-compose.yml
└── README.md
```

---

## Configuration

All backend settings are in `backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | **Required.** Your Anthropic API key |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude model ID |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | sentence-transformers model |
| `CHROMA_DB_PATH` | `./data/chroma_db` | ChromaDB persistence directory |
| `CHUNK_SIZE` | `512` | Max words per chunk |
| `CHUNK_OVERLAP` | `64` | Overlap words between consecutive chunks |
| `TOP_K` | `5` | Number of chunks retrieved per query |

---

## License

MIT
