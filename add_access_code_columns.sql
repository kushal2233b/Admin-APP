-- SQL Migration: Add access_code and requires_access_code columns to tournaments table
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS access_code TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS requires_access_code BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS require_access_code BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;

-- Force postgREST schema reload so client apps see the new columns immediately
NOTIFY pgrst, 'reload schema';
