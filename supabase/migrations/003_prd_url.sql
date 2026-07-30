-- Optional PRD document attachment on applications (v1 spike)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS prd_url TEXT;
