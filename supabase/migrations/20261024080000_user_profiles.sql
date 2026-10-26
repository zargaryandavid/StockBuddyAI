-- Personal details for planning. Age is always calculated from the date of birth and is
-- never stored.
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  date_of_birth date check (
    date_of_birth is null or date_of_birth between date '1900-01-01' and current_date
  ),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

revoke all on table public.user_profiles from anon, authenticated;
grant select, insert, update on table public.user_profiles to authenticated;

create policy user_profiles_select_own on public.user_profiles
for select to authenticated using ((select auth.uid()) = user_id);
create policy user_profiles_insert_own on public.user_profiles
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_profiles_update_own on public.user_profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
