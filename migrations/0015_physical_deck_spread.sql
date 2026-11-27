-- The spread that belongs to a physical session. Cards and revisions are untouched.

ALTER TABLE physical_deck_sessions
  ADD COLUMN IF NOT EXISTS spread_json JSONB;
