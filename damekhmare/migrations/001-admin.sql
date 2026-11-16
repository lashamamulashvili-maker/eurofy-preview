-- Local-only additive migration: admin capability defaults to false.
-- Grant admin explicitly through a trusted local database operator, never via public API.
ALTER TABLE dm_accounts ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS dm_provider_pending_idx ON dm_provider_profiles(created_at)
 WHERE verification_status='pending';
