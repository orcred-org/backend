-- Track outbound emails to waitlist signups (launch invites, updates)

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS last_emailed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emails_sent_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_waitlist_last_emailed_at ON waitlist_entries (last_emailed_at DESC NULLS LAST);
