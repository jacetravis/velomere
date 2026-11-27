-- v19: geometric score and companion artwork are different assets.
-- Existing rows stay legacy approved pictures. New columns are nullable or defaulted.

alter table vel_art_renders add column if not exists asset_role text not null default 'legacy';
alter table vel_art_renders add column if not exists geometry_render_id text;
alter table vel_art_renders add column if not exists provider text;
alter table vel_art_renders add column if not exists model text;
alter table vel_art_renders add column if not exists prompt_version text;
alter table vel_art_renders add column if not exists request_id text;
alter table vel_art_renders add column if not exists source_png_sha256 text;
alter table vel_art_renders add column if not exists width integer;
alter table vel_art_renders add column if not exists height integer;
alter table vel_art_renders add column if not exists mime text not null default 'image/png';

alter table vel_encounter_cards add column if not exists geometry_render_id text;
alter table vel_encounter_cards add column if not exists art_role text not null default 'legacy';

alter table vel_collection_memberships add column if not exists geometry_render_id text;
alter table vel_collection_memberships add column if not exists art_role text not null default 'legacy';
