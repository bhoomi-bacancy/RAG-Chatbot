-- Run this ONE LINE in your Supabase SQL Editor
-- It adds an api_keys column to the existing users table (no new table needed)
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_keys jsonb DEFAULT '{}'::jsonb;
