-- Session feedback + student confirmation

ALTER TABLE reviewer_assignments
  ADD COLUMN IF NOT EXISTS student_session_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS student_feedback_audio SMALLINT
    CHECK (student_feedback_audio IS NULL OR (student_feedback_audio >= 1 AND student_feedback_audio <= 5)),
  ADD COLUMN IF NOT EXISTS student_feedback_video SMALLINT
    CHECK (student_feedback_video IS NULL OR (student_feedback_video >= 1 AND student_feedback_video <= 5)),
  ADD COLUMN IF NOT EXISTS student_feedback_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_session_draft TEXT;
