alter table public.portfolio_positions
  add column purchase_price numeric(20, 6)
    check (purchase_price is null or purchase_price >= 0),
  add column sector text
    check (sector is null or char_length(sector) between 1 and 80);

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
    insert into public.portfolio_positions (
      portfolio_id,
      ticker,
      shares,
      purchase_price,
      sector
    )
    values (
      created.id,
      upper(trim(item->>'ticker')),
      (item->>'shares')::integer,
      nullif(item->>'purchase_price', '')::numeric,
      nullif(trim(item->>'sector'), '')
    );
  end loop;

  return next created;
end;
$$;

