-- Migration: Add username column to users and create index
-- Date: 2026-05-20

BEGIN;

-- Add column if not exists so migration is idempotent
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text;

-- Optionally populate username from full_name when full_name appears to be plain text
-- NOTE: full_name in this project may be stored as an encrypted JSON blob; avoid mass-copying encrypted blobs
-- If you know full_name is plain text for existing rows, uncomment the UPDATE below.
-- UPDATE public.users
-- SET username = full_name
-- WHERE username IS NULL AND full_name IS NOT NULL;

-- Create an index to speed up queries on username
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username);

COMMIT;
