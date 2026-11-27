alter table decks add column if not exists user_id text;

create index if not exists decks_user_idx on decks (user_id, id);

drop index if exists cards_seed_name_suit_idx;

create unique index if not exists cards_seed_deck_name_suit_idx
  on cards (deck_id, lower(name), suit)
  where is_seed is true;

create table if not exists user_libraries (
  user_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
