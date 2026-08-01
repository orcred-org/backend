-- Run in Supabase SQL Editor if admin/reviewer or score APIs fail on missing columns.
-- Safe to re-run (idempotent).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reviewer_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  ALTER TABLE scores RENAME COLUMN originality TO problem_solving;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE scores RENAME COLUMN feedback_orig TO feedback_ps;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN duplicate_column THEN NULL;
END $$;
