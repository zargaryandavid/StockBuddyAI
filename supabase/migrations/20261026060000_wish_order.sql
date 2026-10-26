-- Wishes keep the order the user drags them into. New wishes go to the end of their list.
alter table public.wishes
  add column position bigint not null default (floor(extract(epoch from clock_timestamp()) * 1000))::bigint;

-- Existing wishes keep their current (oldest first) order.
update public.wishes w
set position = ordered.row_number
from (
  select id, row_number() over (partition by user_id, list order by created_at, id) as row_number
  from public.wishes
) ordered
where w.id = ordered.id;

drop index if exists public.wishes_user_idx;
create index wishes_user_idx on public.wishes (user_id, list, position);

-- Saves a new order for one list in a single call. Runs as the caller, so row-level
-- security limits it to the caller's own wishes; ids from other lists are ignored.
create function public.reorder_wishes(target_list text, wish_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with ordered as (
    select id, ordinality as position
    from unnest(wish_ids) with ordinality as item(id, ordinality)
  ), moved as (
    update public.wishes w
    set position = ordered.position, updated_at = now()
    from ordered
    where w.id = ordered.id and w.list = target_list and w.user_id = (select auth.uid())
    returning w.id
  )
  select count(*)::integer from moved;
$$;

revoke all on function public.reorder_wishes(text, uuid[]) from public, anon;
grant execute on function public.reorder_wishes(text, uuid[]) to authenticated;
