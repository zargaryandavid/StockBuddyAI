-- Additive analytics configuration and persisted, user-owned evidence.
-- The Supabase CLI was unavailable while generating this file, so the
-- timestamp follows the existing repository migration convention.

create table public.portfolio_risk_limits (
  portfolio_id uuid primary key references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  max_asset_type_pct numeric(7, 6) not null default 0.80
    check (max_asset_type_pct between 0 and 1),
  max_speculative_pct numeric(7, 6) not null default 0.20
    check (max_speculative_pct between 0 and 1),
  max_top_three_pct numeric(7, 6) not null default 0.70
    check (max_top_three_pct between 0 and 1),
  max_top_five_pct numeric(7, 6) not null default 0.85
    check (max_top_five_pct between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_review_cache (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  review jsonb not null check (jsonb_typeof(review) = 'object'),
  engine text not null default 'rules',
  model text,
  prompt_version text not null,
  data_version text not null,
  input_fingerprint text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (portfolio_id, engine, prompt_version, data_version, input_fingerprint)
);

create table public.portfolio_events (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text check (ticker is null or ticker ~ '^[A-Z0-9.-]{1,12}$'),
  event_type text not null check (
    event_type in (
      'earnings',
      'sec_filing',
      'ex_dividend',
      'dividend_payment',
      'investor_day',
      'user_review'
    )
  ),
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  source_name text not null,
  source_url text,
  verified_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index portfolio_review_cache_portfolio_created_idx
  on public.portfolio_review_cache (portfolio_id, created_at desc);
create index portfolio_events_portfolio_starts_idx
  on public.portfolio_events (portfolio_id, starts_at);

create trigger portfolio_risk_limits_set_updated_at
before update on public.portfolio_risk_limits
for each row execute function private.set_updated_at();

create trigger portfolio_events_set_updated_at
before update on public.portfolio_events
for each row execute function private.set_updated_at();

alter table public.portfolio_risk_limits enable row level security;
alter table public.portfolio_review_cache enable row level security;
alter table public.portfolio_events enable row level security;

revoke all on table public.portfolio_risk_limits from anon, authenticated;
revoke all on table public.portfolio_review_cache from anon, authenticated;
revoke all on table public.portfolio_events from anon, authenticated;

grant select, insert, update, delete on table public.portfolio_risk_limits to authenticated;
grant select, insert, update, delete on table public.portfolio_review_cache to authenticated;
grant select, insert, update, delete on table public.portfolio_events to authenticated;

create policy portfolio_risk_limits_select_own on public.portfolio_risk_limits
for select to authenticated using ((select auth.uid()) = user_id);
create policy portfolio_risk_limits_insert_own on public.portfolio_risk_limits
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_risk_limits.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);
create policy portfolio_risk_limits_update_own on public.portfolio_risk_limits
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy portfolio_risk_limits_delete_own on public.portfolio_risk_limits
for delete to authenticated using ((select auth.uid()) = user_id);

create policy portfolio_review_cache_select_own on public.portfolio_review_cache
for select to authenticated using ((select auth.uid()) = user_id);
create policy portfolio_review_cache_insert_own on public.portfolio_review_cache
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_review_cache.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);
create policy portfolio_review_cache_update_own on public.portfolio_review_cache
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy portfolio_review_cache_delete_own on public.portfolio_review_cache
for delete to authenticated using ((select auth.uid()) = user_id);

create policy portfolio_events_select_own on public.portfolio_events
for select to authenticated using ((select auth.uid()) = user_id);
create policy portfolio_events_insert_own on public.portfolio_events
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_events.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);
create policy portfolio_events_update_own on public.portfolio_events
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy portfolio_events_delete_own on public.portfolio_events
for delete to authenticated using ((select auth.uid()) = user_id);
