-- Orcred: credential issuance v0 (idempotent — safe if 001_schema.sql already applied)
-- Minimal slice: sequence + credentials table + RPC.
-- placement_tracking, linkedin fields, public_opt_in are in 001_schema but unused by v0 code.

CREATE SEQUENCE IF NOT EXISTS credential_seq START 1;

CREATE OR REPLACE FUNCTION next_credential_sequence()
RETURNS INTEGER
LANGUAGE sql
AS $$ SELECT nextval('credential_seq')::INTEGER; $$;

-- Only creates the table on greenfield installs; skipped when 001_schema already ran.
CREATE TABLE IF NOT EXISTS credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID UNIQUE NOT NULL REFERENCES applications(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  credential_id   TEXT UNIQUE NOT NULL,
  credential_url  TEXT NOT NULL,
  hash            TEXT NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credentials' AND policyname = 'students read own credential'
  ) THEN
    CREATE POLICY "students read own credential"
      ON credentials FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;
