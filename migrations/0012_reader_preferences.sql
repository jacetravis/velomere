-- v20.2: per-reader art defaults. Historical renders are not rewritten.

create table if not exists vel_reader_preferences (
  owner_id text primary key,
  default_style text not null,
  interpretive_freedom integer not null,
  updated_at timestamptz not null default now()
);
