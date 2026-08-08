-- Reviewer-specific profile fields (short onboarding for experienced engineers)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_company TEXT,
  ADD COLUMN IF NOT EXISTS "current_role" TEXT,
  ADD COLUMN IF NOT EXISTS years_experience INTEGER,
  ADD COLUMN IF NOT EXISTS expertise TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;
