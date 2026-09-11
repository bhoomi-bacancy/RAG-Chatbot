-- Add password reset fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

-- Add content hash to document_chunks for deduplication
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS document_chunks_hash_user_idx ON document_chunks(user_id, content_hash);
