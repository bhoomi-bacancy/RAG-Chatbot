-- Run this entire file in your Supabase SQL editor once before deploying.

-- 1. Document chunks table with built-in full-text search
create table if not exists document_chunks (
  id           text primary key,
  document_id  text not null,
  user_id      text not null,
  filename     text,
  page_number  int  default 1,
  content      text not null,
  content_hash text,
  fts          tsvector generated always as (to_tsvector('english', content)) stored,
  created_at   timestamptz default now()
);

-- 2. Indexes
create index if not exists document_chunks_fts_idx  on document_chunks using gin(fts);
create index if not exists document_chunks_user_idx on document_chunks(user_id);
create index if not exists document_chunks_doc_idx  on document_chunks(document_id);
create index if not exists document_chunks_hash_idx on document_chunks(content_hash);

-- 3. Full-text search RPC used by the backend
create or replace function search_document_chunks(
  query_text          text,
  match_count         int,
  filter_user_id      text    default null,
  filter_document_ids text[]  default null
)
returns table (
  id           text,
  document_id  text,
  user_id      text,
  filename     text,
  page_number  int,
  content      text,
  rank         float
)
language plpgsql stable
as $$
declare
  and_q text;
  or_q  text;
  tsq   tsquery;
begin
  -- Use OR-based matching so partial keyword matches still return results.
  -- plainto_tsquery produces 'word1' & 'word2'; replacing & with | gives OR logic.
  and_q := plainto_tsquery('english', query_text)::text;
  if and_q = '' then
    return;
  end if;
  or_q := replace(and_q, ' & ', ' | ');
  tsq  := to_tsquery('english', or_q);

  return query
  select
    dc.id,
    dc.document_id,
    dc.user_id,
    dc.filename,
    dc.page_number,
    dc.content,
    ts_rank(dc.fts, tsq)::float as rank
  from document_chunks dc
  where
    dc.fts @@ tsq
    and (filter_user_id      is null or dc.user_id      = filter_user_id)
    and (filter_document_ids is null or dc.document_id  = any(filter_document_ids))
  order by rank desc
  limit match_count;
end;
$$;

-- 4. Documents metadata table
create table if not exists documents (
  id             text primary key default gen_random_uuid()::text,
  user_id        text not null,
  chat_id        text,
  filename       text not null,
  file_type      text,
  chunks_created int  default 0,
  uploaded_at    timestamptz default now()
);
