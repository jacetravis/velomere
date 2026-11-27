-- Additive physical deck continuity. No existing rows are changed.

CREATE TABLE IF NOT EXISTS physical_deck_sessions (
  user_id TEXT NOT NULL,
  deck_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  deck_fingerprint TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS physical_deck_sessions_deck_idx
  ON physical_deck_sessions (user_id, deck_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS physical_deck_one_active_per_deck_idx
  ON physical_deck_sessions (user_id, deck_id) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS physical_deck_operations (
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  from_revision INTEGER NOT NULL,
  to_revision INTEGER NOT NULL,
  before_hash TEXT NOT NULL,
  after_hash TEXT NOT NULL,
  kind TEXT NOT NULL,
  operation_json JSONB NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id, operation_id),
  FOREIGN KEY (user_id, session_id)
    REFERENCES physical_deck_sessions(user_id, session_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS physical_deck_operations_revision_idx
  ON physical_deck_operations (user_id, session_id, to_revision);
