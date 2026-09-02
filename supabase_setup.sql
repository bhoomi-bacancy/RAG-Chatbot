-- Run this entire file in your Supabase SQL editor once before deploying.

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Create document_chunks table
create table if not exists document_chunks (
  id           text primary key,
  document_id  text not null,
  user_id      text not null,
  filename     text,
  page_number  int  default 1,
  content      text not null,
  embedding    vector(1536),
  created_at   timestamptz default now()
);

-- 3. Indexes for filtering and similarity search
create index if not exists document_chunks_user_idx
  on document_chunks (user_id);

create index if not exists document_chunks_doc_idx
  on document_chunks (document_id);

create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. Similarity search RPC used by the backend
create or replace function match_document_chunks(
  query_embedding    vector(1536),
  match_count        int,
  filter_user_id     text    default null,
  filter_document_ids text[] default null
)
returns table (
  id           text,
  document_id  text,
  user_id      text,
  filename     text,
  page_number  int,
  content      text,
  similarity   float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.user_id,
    dc.filename,
    dc.page_number,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where
    (filter_user_id is null or dc.user_id = filter_user_id)
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Documents metadata table (if not already created)
create table if not exists documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  chat_id        text,
  filename       text not null,
  file_type      text,
  chunks_created int  default 0,
  uploaded_at    timestamptz default now()
);
