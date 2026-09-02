-- ============================================================
-- Inkira — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  plan          TEXT        NOT NULL DEFAULT 'free',
  daily_usage   INTEGER     NOT NULL DEFAULT 0,
  usage_date    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chats
CREATE TABLE IF NOT EXISTS chats (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL DEFAULT 'New Chat',
  document_ids TEXT[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    UUID        NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documents (metadata only; BM25 chunks stay in local JSON store)
CREATE TABLE IF NOT EXISTS documents (
  id             TEXT        PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id        UUID        REFERENCES chats(id) ON DELETE SET NULL,
  filename       TEXT        NOT NULL,
  file_type      TEXT        NOT NULL,
  chunks_created INTEGER     NOT NULL DEFAULT 0,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chats_user_id    ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id  ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

-- Disable RLS — the backend uses the service role key which bypasses RLS anyway,
-- but being explicit avoids surprises.
ALTER TABLE users     DISABLE ROW LEVEL SECURITY;
ALTER TABLE chats     DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages  DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
