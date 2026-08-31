-- Run once in Supabase Dashboard → SQL Editor
-- Fixes: "Could not find the table public.waitlist_entries"
-- Safe to re-run (idempotent).

DO $$ BEGIN
  CREATE TYPE waitlist_status AS ENUM ('pending', 'invited', 'converted', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  domain      TEXT NOT NULL,
  degree      TEXT NOT NULL,
  motivation  TEXT NOT NULL,
  status      waitlist_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email_lower ON waitlist_entries (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist_entries (status);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist_entries (created_at DESC);

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS last_emailed_at TIMESTAMPTZ;

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS emails_sent_count INT NOT NULL DEFAULT 0;

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS referral_source TEXT;

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_waitlist_last_emailed_at
  ON waitlist_entries (last_emailed_at DESC NULLS LAST);

-- Reload PostgREST schema cache so new columns are visible to the API immediately
NOTIFY pgrst, 'reload schema';
