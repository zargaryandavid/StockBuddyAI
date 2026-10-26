-- Daily limits for the AI features, so one account can't run up model costs.
-- The limits are set in Admin -> Studio settings; 0 turns a feature off.
alter table public.app_settings
  add column daily_wish_checks integer not null default 100
    check (daily_wish_checks between 0 and 10000),
  add column daily_screenshot_imports integer not null default 20
    check (daily_screenshot_imports between 0 and 10000),
  add column daily_ai_reviews integer not null default 10
    check (daily_ai_reviews between 0 and 10000);

-- How many times each user used each AI feature on each (UTC) day.
create table public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('wish_check', 'screenshot_import', 'ai_review')),
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, feature, day)
);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;
grant select on table public.ai_usage to authenticated;
create policy ai_usage_select_own on public.ai_usage
for select to authenticated using ((select auth.uid()) = user_id);

-- Counts one use for the caller and says whether it was within the limit. Users can read
-- their own counts but only change them through this function, so they can't reset them.
create function public.use_ai_feature(feature_name text, daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  used integer;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if daily_limit <= 0 then
    return false;
  end if;
  insert into public.ai_usage as usage (user_id, feature, day, count)
  values (caller, feature_name, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, feature, day)
  do update set count = usage.count + 1
  where usage.count < daily_limit
  returning count into used;
  return used is not null;
end;
$$;

revoke all on function public.use_ai_feature(text, integer) from public, anon;
grant execute on function public.use_ai_feature(text, integer) to authenticated;
