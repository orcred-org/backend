-- Private session notes (visible to each participant after the call)

ALTER TABLE reviewer_assignments
  ADD COLUMN IF NOT EXISTS reviewer_session_notes TEXT,
  ADD COLUMN IF NOT EXISTS student_session_notes TEXT;
