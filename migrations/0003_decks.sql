create table if not exists decks (
  id serial primary key,
  name text not null,
  locked boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table cards add column if not exists deck_id integer;

create index if not exists cards_deck_idx on cards (deck_id, sort_order, id);
