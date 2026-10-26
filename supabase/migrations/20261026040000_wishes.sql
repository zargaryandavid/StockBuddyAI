-- Wishlist: short-term (within a year) and long-term (1-5 years) wishes, plus the
-- "300 wishes" exercise, where every wish must be different. Owner-only under RLS.
create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list text not null check (list in ('short', 'long', 'exercise')),
  text text not null check (char_length(btrim(text)) between 1 and 200),
  -- Case, spacing, and punctuation removed, so "Visit Japan!" and "visit  japan" match.
  normalized text generated always as (
    btrim(regexp_replace(lower(text), '[^[:alnum:]]+', ' ', 'g'))
  ) stored,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wishes_user_idx on public.wishes (user_id, list, created_at);
-- The same wish cannot appear twice in one list.
create unique index wishes_unique_text on public.wishes (user_id, list, normalized);

-- The exercise holds at most 300 wishes.
create function public.wishes_exercise_limit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.list = 'exercise' and (
    select count(*) from public.wishes
    where user_id = new.user_id and list = 'exercise' and id <> new.id
  ) >= 300 then
    raise exception 'The 300 wishes exercise is full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger wishes_exercise_limit
before insert or update of list on public.wishes
for each row execute function public.wishes_exercise_limit();

alter table public.wishes enable row level security;
revoke all on table public.wishes from anon, authenticated;
grant select, insert, update, delete on table public.wishes to authenticated;

create policy wishes_select_own on public.wishes
for select to authenticated using ((select auth.uid()) = user_id);
create policy wishes_insert_own on public.wishes
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy wishes_update_own on public.wishes
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy wishes_delete_own on public.wishes
for delete to authenticated using ((select auth.uid()) = user_id);
