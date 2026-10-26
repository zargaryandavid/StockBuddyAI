-- Ask Buddy review tokens reset on the 1st of each month instead of every day.
-- Monthly uses are stored on the first day of the (UTC) month; the other AI features
-- keep one row per day. The admin limit for reviews is now a monthly allowance.
create or replace function public.ai_usage_period_start(feature_name text)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when feature_name = 'ai_review'
      then date_trunc('month', now() at time zone 'utc')::date
    else (now() at time zone 'utc')::date
  end;
$$;

grant execute on function public.ai_usage_period_start(text) to authenticated;

create or replace function public.use_ai_feature(feature_name text, daily_limit integer)
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
  values (caller, feature_name, public.ai_usage_period_start(feature_name), 1)
  on conflict (user_id, feature, day)
  do update set count = usage.count + 1
  where usage.count < daily_limit
  returning count into used;
  return used is not null;
end;
$$;

comment on column public.app_settings.daily_ai_reviews is
  'Ask Buddy review tokens per person per month (resets on the 1st, UTC).';
