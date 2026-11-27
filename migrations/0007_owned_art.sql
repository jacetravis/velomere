create table if not exists owned_art (
  id serial primary key,
  user_id text not null,
  opaque text not null,
  relpath text not null,
  mime text not null,
  bytes bytea not null,
  created_at timestamptz not null default now(),
  unique (opaque, relpath)
);

create index if not exists owned_art_owner_idx on owned_art (user_id, opaque);
