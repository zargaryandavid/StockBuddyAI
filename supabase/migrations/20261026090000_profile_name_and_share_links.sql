-- A display name on the profile, and read-only share links for the FIRE plan and a
-- portfolio. Anyone with a link can view it; the API reads the owner's data by the
-- link's secret token, so signed-in users only ever manage their own links here.
alter table public.user_profiles
  add column display_name text check (display_name is null or char_length(display_name) between 1 and 80);

create table public.share_links (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fire', 'portfolio')),
  -- FIRE: the portfolio whose value counts as current assets; Portfolio: the one shared.
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (kind = 'fire' or portfolio_id is not null)
);

-- One FIRE link per person and one link per portfolio.
create unique index share_links_one_fire on public.share_links (user_id) where kind = 'fire';
create unique index share_links_one_per_portfolio on public.share_links (portfolio_id) where kind = 'portfolio';

alter table public.share_links enable row level security;
revoke all on table public.share_links from anon, authenticated;
grant select, insert, delete on table public.share_links to authenticated;

create policy share_links_select_own on public.share_links
for select to authenticated using ((select auth.uid()) = user_id);
create policy share_links_insert_own on public.share_links
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (
    portfolio_id is null
    or exists (
      select 1 from public.portfolios p
      where p.id = portfolio_id and p.user_id = (select auth.uid())
    )
  )
);
create policy share_links_delete_own on public.share_links
for delete to authenticated using ((select auth.uid()) = user_id);
