-- v17.1: each new draw and Encounter is its own dated event.
-- Older session recipe_date / affinity rows are not rewritten.

create table if not exists vel_generation_events (
  event_id text primary key,
  owner_id text not null,
  session_id text not null,
  action text not null check (action in ('initial_pair', 'next_draw', 'encounter_commit')),
  accepted_at_utc text not null,
  time_zone text not null,
  time_zone_source text not null,
  local_date text not null,
  affinity integer not null check (affinity = 0),
  seed_algorithm_version text not null,
  seed_digest text not null,
  engine_version text not null,
  canonical_hash text not null,
  request_idempotency_key text not null,
  session_version_at_acceptance integer not null,
  request_payload_hash text not null,
  status text not null default 'ACCEPTED',
  result_ids_json text not null default '[]',
  parents_json text not null default '[]',
  created_at timestamptz not null default now(),
  unique (owner_id, session_id, request_idempotency_key)
);

alter table vel_encounter_cards add column if not exists generation_event_id text;
alter table vel_journal_drafts add column if not exists adopted_card_id text;
alter table vel_encounter_collections add column if not exists description text;
