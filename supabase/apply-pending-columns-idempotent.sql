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

-- Migration 006: reviewer workflow (run if full reset / admin workflow APIs fail on workflow_stage)
ALTER TABLE reviewer_assignments
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS student_code TEXT,
  ADD COLUMN IF NOT EXISTS proposed_session_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proposed_session_notes TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_completed_at TIMESTAMPTZ;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT;

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS admin_review_status TEXT NOT NULL DEFAULT 'pending';

-- Migration 011: session feedback + reviewer draft
ALTER TABLE reviewer_assignments
  ADD COLUMN IF NOT EXISTS student_session_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS student_feedback_audio SMALLINT,
  ADD COLUMN IF NOT EXISTS student_feedback_video SMALLINT,
  ADD COLUMN IF NOT EXISTS student_feedback_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_session_draft TEXT;

-- Migration 012: private session notes
ALTER TABLE reviewer_assignments
  ADD COLUMN IF NOT EXISTS reviewer_session_notes TEXT,
  ADD COLUMN IF NOT EXISTS student_session_notes TEXT;

-- Migration 013: join audit
ALTER TABLE reviewer_assignments
  ADD COLUMN IF NOT EXISTS reviewer_joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS student_joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_early_end_reason TEXT,
  ADD COLUMN IF NOT EXISTS student_early_end_reason TEXT;
