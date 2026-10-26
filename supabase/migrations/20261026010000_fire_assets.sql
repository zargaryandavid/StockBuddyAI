-- FIRE assets: things a user owns outside the portfolio (rental property, land, a
-- rented-out vehicle or equipment) with their market value. A rental income can link
-- to the asset that earns it. Assets are shown on the FIRE page but are not FIRE
-- assets themselves, because the income they produce is already counted.
create table public.fire_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null check (
    asset_type in ('residential', 'vacation', 'commercial', 'land', 'vehicle', 'equipment', 'other')
  ),
  name text not null check (char_length(name) between 1 and 120),
  market_value numeric(18, 2) check (market_value is null or market_value >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets fire_entries reference an asset only together with its owner.
  unique (id, user_id)
);

create index fire_assets_user_idx on public.fire_assets (user_id, asset_type);

alter table public.fire_entries add column asset_id uuid;
-- An entry can only link to its own user's asset; deleting the asset unlinks it.
alter table public.fire_entries
  add constraint fire_entries_asset_fkey foreign key (asset_id, user_id)
  references public.fire_assets (id, user_id) on delete set null (asset_id);
create index fire_entries_asset_idx on public.fire_entries (asset_id) where asset_id is not null;

alter table public.fire_assets enable row level security;
revoke all on table public.fire_assets from anon, authenticated;
grant select, insert, update, delete on table public.fire_assets to authenticated;

create policy fire_assets_select_own on public.fire_assets
for select to authenticated using ((select auth.uid()) = user_id);
create policy fire_assets_insert_own on public.fire_assets
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fire_assets_update_own on public.fire_assets
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy fire_assets_delete_own on public.fire_assets
for delete to authenticated using ((select auth.uid()) = user_id);

-- Existing rental incomes kept the property value in principal: move each one into a
-- residential asset and link it, so nothing already entered is lost.
with rentals as (
  select id, user_id, name, principal, currency, gen_random_uuid() as asset_id
  from public.fire_entries
  where kind = 'income' and category = 'rent_income'
), created as (
  insert into public.fire_assets (id, user_id, asset_type, name, market_value, currency)
  select asset_id, user_id, 'residential', name, principal, currency from rentals
  returning id
)
update public.fire_entries entry
set asset_id = rentals.asset_id, principal = null
from rentals
where entry.id = rentals.id and rentals.asset_id in (select id from created);
