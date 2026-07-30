-- Where waitlist signups heard about Orcred

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS referral_source TEXT;
