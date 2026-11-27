-- v17.3: a finished cut reserves the true top and bottom before either front is shown.
-- Older sessions default to already revealed so existing pairs stay readable.

alter table vel_encounter_sessions add column if not exists pending_json text;
alter table vel_encounter_sessions add column if not exists pair_revealed integer not null default 1;
