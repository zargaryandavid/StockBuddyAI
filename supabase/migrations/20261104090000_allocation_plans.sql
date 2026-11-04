-- A future allocation plan per person: a budget and the investments they are considering,
-- each as a share or an amount of the budget. Only planning: nothing here is a holding.
create table public.allocation_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  budget numeric(20, 2) not null default 0 check (budget >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  -- [{label, ticker, mode: "pct"|"amount", value, expected_return_pct}], at most 40.
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40),
  updated_at timestamptz not null default now()
);

alter table public.allocation_plans enable row level security;
revoke all on table public.allocation_plans from anon, authenticated;
grant select, insert, update, delete on table public.allocation_plans to authenticated;

create policy allocation_plans_select_own on public.allocation_plans
for select to authenticated using ((select auth.uid()) = user_id);
create policy allocation_plans_insert_own on public.allocation_plans
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy allocation_plans_update_own on public.allocation_plans
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy allocation_plans_delete_own on public.allocation_plans
for delete to authenticated using ((select auth.uid()) = user_id);
