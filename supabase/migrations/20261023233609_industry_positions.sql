alter table public.app_settings
  add column max_industry_pct numeric(5, 4) not null default 0.2500
    check (max_industry_pct > 0 and max_industry_pct <= 1);

create table public.industries (
  name text primary key check (char_length(name) between 1 and 80),
  position_pct numeric(5, 4) not null
    check (position_pct > 0 and position_pct <= 1),
  sort_order smallint not null,
  updated_at timestamptz not null default now()
);

insert into public.industries (name, position_pct, sort_order) values
  ('Communication Services', 0.1000, 1),
  ('Consumer Discretionary', 0.1200, 2),
  ('Consumer Staples', 0.0800, 3),
  ('Energy', 0.0800, 4),
  ('Financials', 0.1500, 5),
  ('Health Care', 0.1500, 6),
  ('Industrials', 0.1200, 7),
  ('Information Technology', 0.2500, 8),
  ('Materials', 0.0800, 9),
  ('Real Estate', 0.0800, 10),
  ('Utilities', 0.0800, 11),
  ('Other', 0.1000, 12);

alter table public.industries enable row level security;
revoke all on table public.industries from anon, authenticated;
grant select, insert, update, delete on table public.industries to service_role;

create trigger industries_set_updated_at
before update on public.industries
for each row execute function private.set_updated_at();
