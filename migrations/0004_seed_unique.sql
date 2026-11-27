delete from cards
where id in (
  select id from (
    select id,
           row_number() over (
             partition by lower(name), suit
             order by id
           ) as n
    from cards
    where is_seed is true
  ) ranked
  where n > 1
);

create unique index if not exists cards_seed_name_suit_idx
  on cards (lower(name), suit)
  where is_seed is true;
