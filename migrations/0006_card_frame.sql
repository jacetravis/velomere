alter table cards add column if not exists image_scale integer not null default 100;
alter table cards add column if not exists image_x integer not null default 0;
alter table cards add column if not exists image_y integer not null default 0;
alter table cards add column if not exists image_radius integer not null default 2;
