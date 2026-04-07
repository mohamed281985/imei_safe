-- Migration: create businesses table
-- Created: 2026-04-07
-- Creates `public.businesses` to store encrypted business data

BEGIN;

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  store_name text,
  owner_name jsonb,
  phone jsonb,
  address jsonb,
  business_type text,
  id_last6 jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FK: reference application users table. Adjust target if your app users table differs.
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_user_id_fkey FOREIGN KEY (user_id)
  REFERENCES public.users(id) ON DELETE CASCADE;

-- One business per user (optional): unique index on user_id
CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_id_idx ON public.businesses (user_id);

COMMIT;
