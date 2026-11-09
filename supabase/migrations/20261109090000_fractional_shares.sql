-- Shares can be fractional (e.g. 5.48 shares from a broker that sells parts of a share).
-- Holdings and transactions keep up to 6 decimal places; every function that reads or writes
-- a share count now uses numeric instead of integer.

alter table public.portfolio_positions
  alter column shares type numeric(20, 6) using shares::numeric;
alter table public.portfolio_transactions
  alter column quantity type numeric(20, 6) using quantity::numeric;

-- Saving a portfolio: shares read as numbers with decimals (otherwise unchanged).
create or replace function public.create_portfolio(
  portfolio_name text,
  portfolio_cash numeric,
  portfolio_positions jsonb default '[]'::jsonb,
  portfolio_base_currency text default 'USD',
  portfolio_benchmark text default 'SPY',
  portfolio_max_position_pct numeric default null,
  portfolio_max_sector_pct numeric default null,
  portfolio_min_cash_pct numeric default 0,
  portfolio_time_horizon text default 'Long Term',
  portfolio_rebalancing_threshold_pct numeric default 0.05
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

  insert into public.portfolios (
    user_id,
    name,
    cash,
    base_currency,
    benchmark,
    max_position_pct,
    max_sector_pct,
    min_cash_pct,
    time_horizon,
    rebalancing_threshold_pct
  )
  values (
    auth.uid(),
    portfolio_name,
    portfolio_cash,
    portfolio_base_currency,
    portfolio_benchmark,
    portfolio_max_position_pct,
    portfolio_max_sector_pct,
    portfolio_min_cash_pct,
    portfolio_time_horizon,
    portfolio_rebalancing_threshold_pct
  )
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
      display_order,
      company_name,
      asset_type,
      industry,
      investment_category,
      classification_source,
      quote_currency,
      lifecycle_phase,
      lifecycle_evidence,
      lifecycle_updated_at,
      report_date,
      report_source,
      notes
    )
    values (
      created.id,
      upper(trim(item->>'ticker')),
      (item->>'shares')::numeric,
      nullif(item->>'purchase_price', '')::numeric,
      nullif(trim(item->>'sector'), ''),
      coalesce((item->>'display_order')::integer, item_order::integer),
      nullif(trim(item->>'company_name'), ''),
      coalesce(nullif(item->>'asset_type', ''), 'Other'),
      nullif(trim(item->>'industry'), ''),
      nullif(item->>'investment_category', ''),
      coalesce(nullif(item->>'classification_source', ''), 'automatic'),
      nullif(item->>'quote_currency', ''),
      coalesce(nullif(item->>'lifecycle_phase', ''), 'Not Analyzed'),
      coalesce((item->'lifecycle_evidence')::jsonb, '{}'::jsonb),
      nullif(item->>'lifecycle_updated_at', '')::timestamptz,
      nullif(item->>'report_date', '')::date,
      nullif(item->>'report_source', ''),
      nullif(item->>'notes', '')
    );
  end loop;

  return next created;
end;
$$;

create or replace function public.update_portfolio(
  target_id uuid,
  portfolio_name text,
  portfolio_cash numeric,
  portfolio_positions jsonb default '[]'::jsonb,
  portfolio_base_currency text default 'USD',
  portfolio_benchmark text default 'SPY',
  portfolio_max_position_pct numeric default null,
  portfolio_max_sector_pct numeric default null,
  portfolio_min_cash_pct numeric default 0,
  portfolio_time_horizon text default 'Long Term',
  portfolio_rebalancing_threshold_pct numeric default 0.05
)
returns setof public.portfolios
language plpgsql
set search_path = ''
as $$
declare
  updated public.portfolios;
  item jsonb;
  item_order bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if jsonb_typeof(portfolio_positions) <> 'array' then
    raise exception 'portfolio_positions must be an array';
  end if;

  update public.portfolios
  set
    name = portfolio_name,
    cash = portfolio_cash,
    base_currency = portfolio_base_currency,
    benchmark = portfolio_benchmark,
    max_position_pct = portfolio_max_position_pct,
    max_sector_pct = portfolio_max_sector_pct,
    min_cash_pct = portfolio_min_cash_pct,
    time_horizon = portfolio_time_horizon,
    rebalancing_threshold_pct = portfolio_rebalancing_threshold_pct
  where id = target_id
    and user_id = auth.uid()
  returning * into updated;

  if updated.id is null then
    return;
  end if;

  delete from public.portfolio_positions where portfolio_id = target_id;

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
      display_order,
      company_name,
      asset_type,
      industry,
      investment_category,
      classification_source,
      quote_currency,
      lifecycle_phase,
      lifecycle_evidence,
      lifecycle_updated_at,
      report_date,
      report_source,
      notes
    )
    values (
      target_id,
      upper(trim(item->>'ticker')),
      (item->>'shares')::numeric,
      nullif(item->>'purchase_price', '')::numeric,
      nullif(trim(item->>'sector'), ''),
      coalesce((item->>'display_order')::integer, item_order::integer),
      nullif(trim(item->>'company_name'), ''),
      coalesce(nullif(item->>'asset_type', ''), 'Other'),
      nullif(trim(item->>'industry'), ''),
      nullif(item->>'investment_category', ''),
      coalesce(nullif(item->>'classification_source', ''), 'automatic'),
      nullif(item->>'quote_currency', ''),
      coalesce(nullif(item->>'lifecycle_phase', ''), 'Not Analyzed'),
      coalesce((item->'lifecycle_evidence')::jsonb, '{}'::jsonb),
      nullif(item->>'lifecycle_updated_at', '')::timestamptz,
      nullif(item->>'report_date', '')::date,
      nullif(item->>'report_source', ''),
      nullif(item->>'notes', '')
    );
  end loop;

  return next updated;
end;
$$;

-- Functions whose share arguments change type are dropped and created again.
drop function public.apply_portfolio_transaction(uuid, text, text, integer, numeric, timestamptz);
drop function public.edit_portfolio_transaction(uuid, text, text, integer, numeric, timestamptz, boolean);
drop function public.shift_portfolio_holding(uuid, text, text, integer, numeric, integer);

create function public.apply_portfolio_transaction(
  target_portfolio_id uuid,
  transaction_ticker text,
  transaction_kind text,
  transaction_quantity numeric,
  transaction_price numeric,
  transaction_transacted_at timestamptz default now()
)
returns setof public.portfolio_transactions
language plpgsql
set search_path = ''
as $$
declare
  normalized_ticker text := upper(trim(transaction_ticker));
  owner_id uuid;
  held_quantity numeric;
  held_purchase_price numeric;
  recorded public.portfolio_transactions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if normalized_ticker !~ '^[A-Z0-9.-]{1,12}$' then
    raise exception 'invalid ticker';
  end if;
  if transaction_kind not in ('buy', 'sell') then
    raise exception 'invalid transaction kind';
  end if;
  if transaction_quantity <= 0 then
    raise exception 'transaction quantity must be positive';
  end if;
  if transaction_price < 0 then
    raise exception 'transaction price cannot be negative';
  end if;

  select user_id
  into owner_id
  from public.portfolios
  where id = target_portfolio_id
    and user_id = (select auth.uid())
  for update;

  if owner_id is null then
    raise exception 'portfolio not found';
  end if;

  select shares, purchase_price
  into held_quantity, held_purchase_price
  from public.portfolio_positions
  where portfolio_id = target_portfolio_id
    and ticker = normalized_ticker
  for update;

  if transaction_kind = 'sell' then
    if held_quantity is null then
      raise exception 'cannot sell a position not held';
    end if;
    if transaction_quantity > held_quantity then
      raise exception 'sale exceeds the held quantity';
    end if;

    if transaction_quantity = held_quantity then
      delete from public.portfolio_positions
      where portfolio_id = target_portfolio_id
        and ticker = normalized_ticker;
    else
      update public.portfolio_positions
      set shares = held_quantity - transaction_quantity
      where portfolio_id = target_portfolio_id
        and ticker = normalized_ticker;
    end if;
  elsif held_quantity is null then
    insert into public.portfolio_positions (
      portfolio_id,
      ticker,
      shares,
      purchase_price,
      display_order
    )
    values (
      target_portfolio_id,
      normalized_ticker,
      transaction_quantity,
      transaction_price,
      coalesce(
        (
          select max(display_order) + 1
          from public.portfolio_positions
          where portfolio_id = target_portfolio_id
        ),
        0
      )
    );
  else
    update public.portfolio_positions
    set
      shares = held_quantity + transaction_quantity,
      purchase_price = (
        held_quantity * coalesce(held_purchase_price, 0)
        + transaction_quantity * transaction_price
      ) / (held_quantity + transaction_quantity)
    where portfolio_id = target_portfolio_id
      and ticker = normalized_ticker;
  end if;

  insert into public.portfolio_transactions (
    portfolio_id,
    user_id,
    ticker,
    kind,
    quantity,
    price,
    transacted_at
  )
  values (
    target_portfolio_id,
    owner_id,
    normalized_ticker,
    transaction_kind,
    transaction_quantity,
    transaction_price,
    transaction_transacted_at
  )
  returning * into recorded;

  return next recorded;
end;
$$;

revoke all on function public.apply_portfolio_transaction(uuid, text, text, numeric, numeric, timestamptz) from public, anon;
grant execute on function public.apply_portfolio_transaction(uuid, text, text, numeric, numeric, timestamptz) to authenticated;

create function public.shift_portfolio_holding(
  target_portfolio_id uuid,
  holding_ticker text,
  trade_kind text,
  trade_quantity numeric,
  trade_price numeric,
  direction integer
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  held_quantity numeric;
  held_price numeric;
  -- A buy applied or a sell undone adds shares; a sell applied or a buy undone removes them.
  adding boolean := (trade_kind = 'buy') = (direction = 1);
  remaining numeric;
begin
  select shares, purchase_price
  into held_quantity, held_price
  from public.portfolio_positions
  where portfolio_id = target_portfolio_id
    and ticker = holding_ticker
  for update;

  if adding then
    if held_quantity is null then
      insert into public.portfolio_positions (portfolio_id, ticker, shares, purchase_price, display_order)
      values (
        target_portfolio_id,
        holding_ticker,
        trade_quantity,
        trade_price,
        coalesce(
          (select max(display_order) + 1 from public.portfolio_positions where portfolio_id = target_portfolio_id),
          0
        )
      );
    else
      update public.portfolio_positions
      set
        shares = held_quantity + trade_quantity,
        -- A buy raises or lowers the average cost; a sell put back keeps it.
        purchase_price = case
          when trade_kind = 'buy' then
            (held_quantity * coalesce(held_price, trade_price) + trade_quantity * trade_price)
            / (held_quantity + trade_quantity)
          else held_price
        end
      where portfolio_id = target_portfolio_id
        and ticker = holding_ticker;
    end if;
  else
    if held_quantity is null or held_quantity < trade_quantity then
      raise exception 'holdings have fewer % shares than this change needs', holding_ticker;
    end if;
    remaining := held_quantity - trade_quantity;
    if remaining = 0 then
      delete from public.portfolio_positions
      where portfolio_id = target_portfolio_id
        and ticker = holding_ticker;
    else
      update public.portfolio_positions
      set
        shares = remaining,
        -- Taking a buy back out takes its cost out of the average too.
        purchase_price = case
          when trade_kind = 'buy' and held_price is not null
            and (held_price * held_quantity - trade_price * trade_quantity) / remaining > 0
          then (held_price * held_quantity - trade_price * trade_quantity) / remaining
          else held_price
        end
      where portfolio_id = target_portfolio_id
        and ticker = holding_ticker;
    end if;
  end if;
end;
$$;

revoke all on function public.shift_portfolio_holding(uuid, text, text, numeric, numeric, integer) from public, anon;
grant execute on function public.shift_portfolio_holding(uuid, text, text, numeric, numeric, integer) to authenticated;

create function public.edit_portfolio_transaction(
  target_transaction_id uuid,
  new_ticker text,
  new_kind text,
  new_quantity numeric,
  new_price numeric,
  new_transacted_at timestamptz,
  adjust_holdings boolean default true
)
returns setof public.portfolio_transactions
language plpgsql
set search_path = ''
as $$
declare
  old_row public.portfolio_transactions;
  ticker_value text := upper(trim(new_ticker));
  saved public.portfolio_transactions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if ticker_value !~ '^[A-Z0-9.-]{1,12}$' then
    raise exception 'invalid ticker';
  end if;
  if new_kind not in ('buy', 'sell') then
    raise exception 'invalid transaction kind';
  end if;
  if new_quantity <= 0 then
    raise exception 'transaction quantity must be positive';
  end if;
  if new_price < 0 then
    raise exception 'transaction price cannot be negative';
  end if;
  select * into old_row
  from public.portfolio_transactions
  where id = target_transaction_id
    and user_id = (select auth.uid())
  for update;
  if old_row.id is null then
    raise exception 'transaction not found';
  end if;
  if adjust_holdings then
    perform public.shift_portfolio_holding(
      old_row.portfolio_id, old_row.ticker, old_row.kind, old_row.quantity, old_row.price, -1
    );
    perform public.shift_portfolio_holding(
      old_row.portfolio_id, ticker_value, new_kind, new_quantity, new_price, 1
    );
  end if;
  update public.portfolio_transactions
  set ticker = ticker_value,
      kind = new_kind,
      quantity = new_quantity,
      price = new_price,
      transacted_at = new_transacted_at
  where id = target_transaction_id
  returning * into saved;
  return next saved;
end;
$$;

revoke all on function public.edit_portfolio_transaction(uuid, text, text, numeric, numeric, timestamptz, boolean) from public, anon;
grant execute on function public.edit_portfolio_transaction(uuid, text, text, numeric, numeric, timestamptz, boolean) to authenticated;
