create table if not exists vel_encounter_sessions (
  id text primary key,
  owner_id text not null,
  recipe_date text not null,
  affinity integer not null check (affinity between 0 and 78),
  status text not null,
  active_ids_json text not null,
  draw_pool_json text not null,
  history_json text not null default '[]',
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vel_encounter_sessions_owner_idx
  on vel_encounter_sessions (owner_id, updated_at desc);

create table if not exists vel_encounter_cards (
  id text primary key,
  owner_id text not null,
  session_id text not null,
  kind text not null check (kind in ('canonical_draw', 'emergent')),
  canon_hash text not null,
  canonical_index integer,
  parent_ids_json text not null default '[]',
  semantics_json text not null,
  compound_json text not null,
  outcome text,
  evidence_json text not null default '[]',
  scene_hash text not null,
  scene_json text not null,
  render_id text,
  created_at timestamptz not null default now()
);

create index if not exists vel_encounter_cards_owner_idx
  on vel_encounter_cards (owner_id, session_id);

create table if not exists vel_encounter_commits (
  id text primary key,
  session_id text not null,
  owner_id text not null,
  left_parent_id text not null,
  right_parent_id text not null,
  child_id text not null unique,
  outcome text not null,
  commit_sha256 text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (session_id, idempotency_key)
);

create table if not exists vel_encounter_actions (
  id text primary key,
  session_id text not null,
  owner_id text not null,
  idempotency_key text not null,
  kind text not null,
  result_json text not null,
  created_at timestamptz not null default now(),
  unique (session_id, idempotency_key)
);

create table if not exists vel_journal_drafts (
  id text primary key,
  owner_id text not null,
  source_card_id text not null,
  status text not null,
  dialogue_json text not null default '[]',
  personal_json text,
  created_at timestamptz not null default now()
);

create table if not exists vel_adopted_cards (
  id text primary key,
  owner_id text not null,
  source_card_id text not null,
  source_snapshot_json text not null,
  personal_json text not null,
  author_version integer not null default 1,
  approval_json text not null,
  created_at timestamptz not null default now()
);

create table if not exists vel_encounter_collections (
  id text primary key,
  owner_id text not null,
  name text not null,
  landing_zone integer not null default 0,
  style_preset text not null default 'living_matter',
  style_version text not null default '17.0.0',
  version integer not null default 0,
  deck_id integer,
  created_at timestamptz not null default now()
);

create unique index if not exists vel_one_landing_zone_per_owner
  on vel_encounter_collections (owner_id) where landing_zone = 1;

create table if not exists vel_collection_memberships (
  id text primary key,
  collection_id text not null,
  adopted_card_id text not null,
  owner_id text not null,
  position integer not null,
  render_id text,
  card_id integer,
  styled integer not null default 0,
  style_locked integer not null default 0,
  scene_hash text not null,
  presentation_version integer not null default 0,
  unique (collection_id, adopted_card_id)
);

create table if not exists vel_style_jobs (
  id text primary key,
  owner_id text not null,
  collection_id text not null,
  idempotency_key text not null,
  collection_version integer not null,
  scope text not null check (scope in ('unlocked_only', 'unlock_all')),
  preset_id text not null,
  preset_version text not null,
  targets_json text not null,
  candidates_json text,
  status text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table if not exists vel_art_renders (
  id text primary key,
  owner_id text not null,
  scene_hash text not null,
  style_id text not null,
  style_version text not null,
  backend_id text not null,
  content_hash text not null,
  quality_json text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists vel_art_renders_owner_idx on vel_art_renders (owner_id, id);
