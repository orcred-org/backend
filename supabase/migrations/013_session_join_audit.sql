-- Session join times + early-end explanations

ALTER TABLE reviewer_assignments
  ADD COLUMN IF NOT EXISTS reviewer_joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS student_joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_early_end_reason TEXT,
  ADD COLUMN IF NOT EXISTS student_early_end_reason TEXT;
