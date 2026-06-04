-- ─────────────────────────────────────────────
-- Orcred — Full Database Schema
-- Supabase Postgres, India region (Mumbai)
-- ─────────────────────────────────────────────

-- Enums
CREATE TYPE user_role AS ENUM ('student', 'reviewer', 'admin');
CREATE TYPE application_status AS ENUM (
  'submitted', 'payment_pending', 'payment_confirmed',
  'reviewer_assigned', 'scheduled', 'completed'
);
CREATE TYPE assignment_status AS ENUM (
  'assigned', 'scheduled', 'completed',
  'no_show_student', 'no_show_reviewer'
);

-- ── Table 1: users ──
CREATE TABLE users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT UNIQUE NOT NULL,
  account_type     user_role NOT NULL DEFAULT 'student',
  full_name        TEXT,
  college          TEXT,
  graduation_year  INTEGER,
  linkedin_url     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_given    BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at       TIMESTAMPTZ
);

-- ── Table 2: project_ideas ──
CREATE TABLE project_ideas (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_name                TEXT NOT NULL,
  description                 TEXT,
  tech_stack                  TEXT,
  difficulty                  INTEGER CHECK (difficulty BETWEEN 1 AND 5),
  why_reviewable              TEXT,
  key_architectural_decision  TEXT,
  what_could_go_wrong         TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT FALSE,
  generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source                      TEXT CHECK (source IN ('public', 'dashboard'))
);

-- ── Table 3: applications ──
CREATE TABLE applications (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id),
  project_idea_id        UUID REFERENCES project_ideas(id),
  project_name           TEXT NOT NULL,
  tech_stack             TEXT NOT NULL,
  github_url             TEXT NOT NULL,
  loom_url               TEXT NOT NULL,
  build_decision_1       TEXT NOT NULL,
  build_decision_2       TEXT NOT NULL,
  build_decision_3       TEXT NOT NULL,
  what_broke             TEXT NOT NULL,
  ai_tools_used          TEXT NOT NULL,
  availability           JSONB NOT NULL DEFAULT '[]',
  status                 application_status NOT NULL DEFAULT 'submitted',
  utr_number             TEXT,
  payment_screenshot_url TEXT,
  payment_amount         INTEGER NOT NULL DEFAULT 199900,
  payment_at             TIMESTAMPTZ,
  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recording_consent      BOOLEAN NOT NULL DEFAULT FALSE,
  recording_url          TEXT,
  recording_delete_at    TIMESTAMPTZ,
  dispute_flag           BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Table 4: reviewer_assignments ──
CREATE TABLE reviewer_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID NOT NULL REFERENCES applications(id),
  reviewer_id      UUID NOT NULL REFERENCES users(id),
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_date     TIMESTAMPTZ,
  daily_room_url   TEXT,
  daily_room_name  TEXT,
  session_duration INTEGER,
  status           assignment_status NOT NULL DEFAULT 'assigned'
);

-- ── Credential sequence (race-safe sequential IDs) ──
CREATE SEQUENCE credential_seq START 1;

CREATE OR REPLACE FUNCTION next_credential_sequence()
RETURNS INTEGER
LANGUAGE sql
AS $$ SELECT nextval('credential_seq')::INTEGER; $$;

-- ── Table 5: scores ──
CREATE TABLE scores (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id         UUID UNIQUE NOT NULL REFERENCES applications(id),
  reviewer_id            UUID NOT NULL REFERENCES users(id),
  technical_depth        INTEGER NOT NULL CHECK (technical_depth BETWEEN 0 AND 100),
  communication          INTEGER NOT NULL CHECK (communication BETWEEN 0 AND 100),
  reproducibility        INTEGER NOT NULL CHECK (reproducibility BETWEEN 0 AND 100),
  originality            INTEGER NOT NULL CHECK (originality BETWEEN 0 AND 100),
  total_score            INTEGER NOT NULL,
  passed                 BOOLEAN NOT NULL,
  feedback_td            TEXT NOT NULL,
  feedback_comm          TEXT NOT NULL,
  feedback_repro         TEXT NOT NULL,
  feedback_orig          TEXT NOT NULL,
  internal_notes         TEXT,
  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_borderline          BOOLEAN NOT NULL DEFAULT FALSE,
  second_review_requested BOOLEAN NOT NULL DEFAULT FALSE,
  second_reviewer_id     UUID REFERENCES users(id),
  second_review_score    INTEGER,
  final_score            INTEGER NOT NULL
);

-- ── Table 6: credentials ──
CREATE TABLE credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID UNIQUE NOT NULL REFERENCES applications(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  credential_id   TEXT UNIQUE NOT NULL,
  credential_url  TEXT NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linkedin_added  BOOLEAN NOT NULL DEFAULT FALSE,
  linkedin_added_at TIMESTAMPTZ,
  hash            TEXT NOT NULL,
  public_opt_in   BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Table 7: placement_tracking ──
CREATE TABLE placement_tracking (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  credential_id       UUID NOT NULL REFERENCES credentials(id),
  followup_30_due     DATE,
  followup_30_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  followup_30_response TEXT,
  followup_60_due     DATE,
  followup_60_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  followup_60_response TEXT,
  followup_90_due     DATE,
  followup_90_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  followup_90_response TEXT,
  placed              BOOLEAN,
  placed_at           DATE,
  company             TEXT,
  role                TEXT,
  notes               TEXT
);

-- ─────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_ideas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviewer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_tracking  ENABLE ROW LEVEL SECURITY;

-- Users: students read/write own row only
CREATE POLICY student_own_data ON users
  FOR ALL TO authenticated
  USING (id = auth.uid() AND account_type = 'student');

-- Project ideas: students manage own ideas
CREATE POLICY student_own_ideas ON project_ideas
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Applications: students manage own applications
CREATE POLICY student_own_applications ON applications
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Reviewer assignments: reviewers read only their assigned submissions
CREATE POLICY reviewer_assigned_only ON applications
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT application_id FROM reviewer_assignments
      WHERE reviewer_id = auth.uid()
    )
    AND (SELECT account_type FROM users WHERE id = auth.uid()) = 'reviewer'
  );

-- Scores: reviewer can only INSERT for assigned completed sessions, never UPDATE
CREATE POLICY reviewer_score_insert ON scores
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND application_id IN (
      SELECT application_id FROM reviewer_assignments
      WHERE reviewer_id = auth.uid()
    )
  );

-- Students can read their own scores
CREATE POLICY student_read_own_scores ON scores
  FOR SELECT TO authenticated
  USING (
    application_id IN (
      SELECT id FROM applications WHERE user_id = auth.uid()
    )
  );

-- Credentials: public read (for verification page)
CREATE POLICY public_credential_read ON credentials
  FOR SELECT TO anon
  USING (true);

-- Students read own credentials
CREATE POLICY student_own_credentials ON credentials
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Placement tracking: students read own
CREATE POLICY student_own_placement ON placement_tracking
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────

CREATE INDEX idx_applications_user_id    ON applications(user_id);
CREATE INDEX idx_applications_status     ON applications(status);
CREATE INDEX idx_project_ideas_user_id   ON project_ideas(user_id);
CREATE INDEX idx_project_ideas_active    ON project_ideas(user_id, is_active);
CREATE INDEX idx_assignments_reviewer    ON reviewer_assignments(reviewer_id);
CREATE INDEX idx_assignments_application ON reviewer_assignments(application_id);
CREATE INDEX idx_scores_application      ON scores(application_id);
CREATE INDEX idx_credentials_user        ON credentials(user_id);
CREATE INDEX idx_credentials_cred_id     ON credentials(credential_id);
CREATE INDEX idx_placement_user          ON placement_tracking(user_id);
