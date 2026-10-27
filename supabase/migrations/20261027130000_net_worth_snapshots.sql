-- One net worth reading per person per day, saved when they open the app, for the
-- "Net worth over time" chart.
create table public.net_worth_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  investments numeric(18, 2) not null default 0,
  savings numeric(18, 2) not null default 0,
  other_assets numeric(18, 2) not null default 0,
  total numeric(18, 2) not null,
  currency text not null default 'USD' check (char_length(currency) = 3),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.net_worth_snapshots enable row level security;
revoke all on table public.net_worth_snapshots from anon, authenticated;
grant select, insert, update on table public.net_worth_snapshots to authenticated;

create policy net_worth_snapshots_select_own on public.net_worth_snapshots
for select to authenticated using ((select auth.uid()) = user_id);
create policy net_worth_snapshots_insert_own on public.net_worth_snapshots
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy net_worth_snapshots_update_own on public.net_worth_snapshots
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
