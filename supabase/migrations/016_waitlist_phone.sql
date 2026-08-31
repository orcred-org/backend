-- Waitlist: collect phone for launch outreach (India + international)

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS phone TEXT;

NOTIFY pgrst, 'reload schema';
