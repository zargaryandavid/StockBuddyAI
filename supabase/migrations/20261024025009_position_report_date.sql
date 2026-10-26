alter table public.portfolio_positions
  add column report_date date,
  add column report_source text
    check (report_source is null or char_length(report_source) between 1 and 80);

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
      (item->>'shares')::integer,
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
      (item->>'shares')::integer,
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
