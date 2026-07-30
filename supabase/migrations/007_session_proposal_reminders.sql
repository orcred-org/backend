-- Session proposal tracking for admin reminders

ALTER TABLE reviewer_assignments
  ADD COLUMN IF NOT EXISTS session_proposal_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_session_reminder_count INT NOT NULL DEFAULT 0;
