create schema if not exists private;

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  cash numeric(20, 4) not null default 0 check (cash >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z0-9.-]{1,12}$'),
  shares integer not null check (shares >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, ticker)
);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z0-9.-]{1,12}$'),
  as_of date not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  error text,
  decision jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.analysis_signals (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.analysis_runs(id) on delete cascade,
  strategy text not null,
  persona text not null,
  ticker text not null,
  signal text not null check (signal in ('bullish', 'bearish', 'neutral')),
  confidence numeric(5, 2) not null check (confidence between 0 and 100),
  value numeric(6, 5) not null check (value between -1 and 1),
  reasoning text not null,
  abstained boolean not null default false,
  unique (run_id, strategy, persona, ticker)
);

create table public.recommendations (
  id bigint generated always as identity primary key,
  run_id uuid not null unique references public.analysis_runs(id) on delete cascade,
  ticker text not null,
  label text not null check (label in ('sell', 'hold', 'add', 'trim')),
  current_weight numeric(10, 8) not null,
  target_weight numeric(10, 8) not null,
  delta_shares integer not null,
  mark numeric(20, 6) not null check (mark > 0)
);

create index portfolios_user_created_idx
  on public.portfolios (user_id, created_at desc);
create index portfolio_positions_portfolio_idx
  on public.portfolio_positions (portfolio_id);
create index analysis_runs_user_created_idx
  on public.analysis_runs (user_id, created_at desc);
create index analysis_runs_portfolio_idx
  on public.analysis_runs (portfolio_id);
create index analysis_signals_run_idx
  on public.analysis_signals (run_id);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger portfolios_set_updated_at
before update on public.portfolios
for each row execute function private.set_updated_at();

create trigger portfolio_positions_set_updated_at
before update on public.portfolio_positions
for each row execute function private.set_updated_at();

alter table public.portfolios enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.analysis_signals enable row level security;
alter table public.recommendations enable row level security;

revoke all on table public.portfolios from anon, authenticated;
revoke all on table public.portfolio_positions from anon, authenticated;
revoke all on table public.analysis_runs from anon, authenticated;
revoke all on table public.analysis_signals from anon, authenticated;
revoke all on table public.recommendations from anon, authenticated;

grant select, insert, update, delete on table public.portfolios to authenticated;
grant select, insert, update, delete on table public.portfolio_positions to authenticated;
grant select on table public.analysis_runs to authenticated;
grant select on table public.analysis_signals to authenticated;
grant select on table public.recommendations to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy portfolios_select_own on public.portfolios
for select to authenticated using ((select auth.uid()) = user_id);
create policy portfolios_insert_own on public.portfolios
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy portfolios_update_own on public.portfolios
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy portfolios_delete_own on public.portfolios
for delete to authenticated using ((select auth.uid()) = user_id);

create policy positions_select_own on public.portfolio_positions
for select to authenticated using (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_positions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);
create policy positions_insert_own on public.portfolio_positions
for insert to authenticated with check (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_positions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);
create policy positions_update_own on public.portfolio_positions
for update to authenticated
using (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_positions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_positions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);
create policy positions_delete_own on public.portfolio_positions
for delete to authenticated using (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_positions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy runs_select_own on public.analysis_runs
for select to authenticated using ((select auth.uid()) = user_id);
create policy signals_select_own on public.analysis_signals
for select to authenticated using (
  exists (
    select 1 from public.analysis_runs
    where analysis_runs.id = analysis_signals.run_id
      and analysis_runs.user_id = (select auth.uid())
  )
);
create policy recommendations_select_own on public.recommendations
for select to authenticated using (
  exists (
    select 1 from public.analysis_runs
    where analysis_runs.id = recommendations.run_id
      and analysis_runs.user_id = (select auth.uid())
  )
);

create function public.create_portfolio(
  portfolio_name text,
  portfolio_cash numeric,
  portfolio_positions jsonb default '[]'::jsonb
)
returns setof public.portfolios
language plpgsql
set search_path = ''
as $$
declare
  created public.portfolios;
  item jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if jsonb_typeof(portfolio_positions) <> 'array' then
    raise exception 'portfolio_positions must be an array';
  end if;

  insert into public.portfolios (user_id, name, cash)
  values (auth.uid(), portfolio_name, portfolio_cash)
  returning * into created;

  for item in select * from jsonb_array_elements(portfolio_positions)
  loop
    insert into public.portfolio_positions (portfolio_id, ticker, shares)
    values (
      created.id,
      upper(trim(item->>'ticker')),
      (item->>'shares')::integer
    );
  end loop;

  return next created;
end;
$$;

revoke all on function public.create_portfolio(text, numeric, jsonb) from public, anon;
grant execute on function public.create_portfolio(text, numeric, jsonb) to authenticated;
