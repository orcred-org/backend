-- Waitlist for pre-launch signups (short form before full application)

CREATE TYPE waitlist_status AS ENUM ('pending', 'invited', 'converted', 'rejected');

CREATE TABLE waitlist_entries (
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

CREATE UNIQUE INDEX idx_waitlist_email_lower ON waitlist_entries (LOWER(email));
CREATE INDEX idx_waitlist_status ON waitlist_entries (status);
CREATE INDEX idx_waitlist_created_at ON waitlist_entries (created_at DESC);

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Backend uses service_role; no client policies
