-- Compact checkpoint hash. Operation history stays in physical_deck_operations.
-- Existing snapshots are left in place; the next commit writes the hash.

ALTER TABLE physical_deck_sessions
  ADD COLUMN IF NOT EXISTS checkpoint_hash TEXT;
