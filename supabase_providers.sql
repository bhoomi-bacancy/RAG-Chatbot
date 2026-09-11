-- Run this once in your Supabase SQL editor.
-- Stores which providers each user has connected (no API keys stored -- platform pays).

create table if not exists user_provider_connections (
  id           uuid default gen_random_uuid() primary key,
  user_id      text not null,
  provider     text not null,  -- 'openai' | 'anthropic' | 'google'
  google_sub   text,           -- Google user sub (for Google OAuth only)
  connected_at timestamptz default now(),
  unique(user_id, provider)
);

create index if not exists upc_user_idx on user_provider_connections(user_id);
