create table if not exists cards (
  id serial primary key,
  name text not null,
  suit text not null,
  rank text not null default '',
  keywords text not null default '',
  upright text not null default '',
  reversed text not null default '',
  image_url text,
  is_seed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists cards_sort_idx on cards (sort_order, id);
