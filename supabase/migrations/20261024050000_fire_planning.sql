-- FIRE planning: a user's repeating and one-time incomes and expenses, plus the
-- assumptions behind their financial-independence projection. Modeled on Path2Wealth.
create table public.fire_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  category text not null check (category ~ '^[a-z_]{1,40}$'),
  name text not null check (char_length(name) between 1 and 120),
  -- Cash received or paid each time the entry occurs, in `currency`.
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  frequency text not null default 'monthly'
    check (frequency in ('once', 'monthly', 'quarterly', 'semiannual', 'annual')),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  -- Savings accounts, CDs, and bonds: the balance or face value and its yearly rate.
  principal numeric(18, 2) check (principal is null or principal >= 0),
  yield_pct numeric(7, 4) check (yield_pct is null or yield_pct between 0 and 100),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fire_entries_user_idx on public.fire_entries (user_id, kind, starts_on);

create table public.fire_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expected_return_pct numeric(6, 3) not null default 7 check (expected_return_pct between -50 and 50),
  -- Null means "use the yearly total of planned expenses".
  retirement_annual_spend numeric(18, 2) check (retirement_annual_spend is null or retirement_annual_spend >= 0),
  -- Null means "use monthly income minus monthly expenses".
  monthly_invest numeric(18, 2) check (monthly_invest is null or monthly_invest >= 0),
  withdrawal_rate_pct numeric(5, 3) not null default 4 check (withdrawal_rate_pct between 1 and 10),
  updated_at timestamptz not null default now()
);

alter table public.fire_entries enable row level security;
alter table public.fire_settings enable row level security;

revoke all on table public.fire_entries from anon, authenticated;
revoke all on table public.fire_settings from anon, authenticated;
grant select, insert, update, delete on table public.fire_entries to authenticated;
grant select, insert, update on table public.fire_settings to authenticated;

create policy fire_entries_select_own on public.fire_entries
for select to authenticated using ((select auth.uid()) = user_id);
create policy fire_entries_insert_own on public.fire_entries
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fire_entries_update_own on public.fire_entries
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy fire_entries_delete_own on public.fire_entries
for delete to authenticated using ((select auth.uid()) = user_id);

create policy fire_settings_select_own on public.fire_settings
for select to authenticated using ((select auth.uid()) = user_id);
create policy fire_settings_insert_own on public.fire_settings
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fire_settings_update_own on public.fire_settings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
