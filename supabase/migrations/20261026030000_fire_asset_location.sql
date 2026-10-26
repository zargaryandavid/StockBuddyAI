-- Optional location of an asset (an address, city, or area), shown in the Assets list.
alter table public.fire_assets
  add column location text check (location is null or char_length(location) between 1 and 200);
