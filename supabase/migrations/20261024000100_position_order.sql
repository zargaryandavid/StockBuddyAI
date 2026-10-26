alter table public.portfolio_positions
  add column if not exists display_order integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.portfolio_positions'::regclass
      and conname = 'portfolio_positions_display_order_check'
  ) then
    alter table public.portfolio_positions
      add constraint portfolio_positions_display_order_check
      check (display_order >= 0);
  end if;
end;
$$;

with ranked as (
  select
    id,
    row_number() over (
      partition by portfolio_id
      order by created_at, id
    ) - 1 as position_order
  from public.portfolio_positions
)
update public.portfolio_positions as positions
set display_order = ranked.position_order
from ranked
where positions.id = ranked.id;

create index if not exists portfolio_positions_portfolio_order_idx
  on public.portfolio_positions (portfolio_id, display_order);

create or replace function public.create_portfolio(
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
  item_order bigint;
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

  for item, item_order in
    select value, ordinality - 1
    from jsonb_array_elements(portfolio_positions) with ordinality
  loop
    insert into public.portfolio_positions (
      portfolio_id,
      ticker,
      shares,
      purchase_price,
      sector,
      display_order
    )
    values (
      created.id,
      upper(trim(item->>'ticker')),
      (item->>'shares')::integer,
      nullif(item->>'purchase_price', '')::numeric,
      nullif(trim(item->>'sector'), ''),
      coalesce((item->>'display_order')::integer, item_order::integer)
    );
  end loop;

  return next created;
end;
$$;
