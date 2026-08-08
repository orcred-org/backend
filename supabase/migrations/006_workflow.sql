-- Reviewer workflow: staged assignment, tasks kanban, admin score gate

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

CREATE TABLE IF NOT EXISTS reviewer_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL REFERENCES reviewer_assignments(id) ON DELETE CASCADE,
  application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  reviewer_id     UUID NOT NULL REFERENCES users(id),
  task_key        TEXT NOT NULL,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('new', 'todo', 'in_progress', 'done', 'cancelled', 'under_review')),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  unlocked        BOOLEAN NOT NULL DEFAULT FALSE,
  is_custom       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviewer_tasks_reviewer ON reviewer_tasks(reviewer_id, status);
CREATE INDEX IF NOT EXISTS idx_reviewer_tasks_assignment ON reviewer_tasks(assignment_id);
