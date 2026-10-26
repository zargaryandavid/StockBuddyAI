-- Expected yearly inflation for the FIRE projection, which is shown in today's dollars.
alter table public.fire_settings
  add column inflation_pct numeric(5, 3) not null default 3
    check (inflation_pct between -5 and 20);
