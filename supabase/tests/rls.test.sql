begin;
select plan(17);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'other@example.com');

insert into public.portfolios (id, user_id, name, cash)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Mine', 1000),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Theirs', 1000);

insert into public.portfolio_positions (portfolio_id, ticker, shares)
values
  ('10000000-0000-0000-0000-000000000001', 'AAPL', 10),
  ('10000000-0000-0000-0000-000000000002', 'MSFT', 20);

insert into public.analysis_runs (id, user_id, portfolio_id, ticker, as_of)
values (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'AAPL',
  current_date
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  'select name from public.portfolios order by name',
  $$values ('Mine'::text)$$,
  'a user can read only their portfolio'
);

select results_eq(
  'select ticker from public.portfolio_positions order by ticker',
  $$values ('AAPL'::text)$$,
  'a user can read only positions belonging to their portfolio'
);

select lives_ok(
  $$insert into public.portfolios (user_id, name, cash)
    values ('00000000-0000-0000-0000-000000000001', 'Second', 50)$$,
  'a user can create their own portfolio'
);

select throws_ok(
  $$insert into public.portfolios (user_id, name, cash)
    values ('00000000-0000-0000-0000-000000000002', 'Attack', 50)$$,
  '42501',
  null,
  'a user cannot create a portfolio for another user'
);

select throws_ok(
  $$insert into public.portfolio_positions (portfolio_id, ticker, shares)
    values ('10000000-0000-0000-0000-000000000002', 'NVDA', 1)$$,
  '42501',
  null,
  'a user cannot add positions to another portfolio'
);

select results_eq(
  'select ticker from public.analysis_runs',
  $$values ('AAPL'::text)$$,
  'a user can read their own analysis'
);

select throws_ok(
  $$insert into public.analysis_runs
    (user_id, portfolio_id, ticker, as_of)
    values (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'AAPL',
      current_date
    )$$,
  '42501',
  null,
  'authenticated clients cannot create analysis records directly'
);

select is(
  (
    select count(*)::integer
    from public.create_portfolio(
      'Created by RPC',
      125,
      '[{"ticker":"aapl","shares":2,"purchase_price":42.5,"sector":"Information Technology","display_order":4}]'::jsonb
    )
  ),
  1,
  'the authenticated portfolio RPC creates one portfolio'
);

select results_eq(
  $$select pp.purchase_price, pp.sector, pp.display_order
    from public.portfolio_positions pp
    join public.portfolios p on p.id = pp.portfolio_id
    where p.name = 'Created by RPC'$$,
  $$values (42.5::numeric, 'Information Technology'::text, 4::integer)$$,
  'the portfolio RPC stores purchase price, sector, and display order'
);

select results_eq(
  $$select base_currency, benchmark, time_horizon
    from public.portfolios
    where name = 'Created by RPC'$$,
  $$values ('USD'::text, 'SPY'::text, 'Long Term'::text)$$,
  'new portfolios receive backward-compatible settings'
);

select is(
  (
    select count(*)::integer
    from public.update_portfolio(
      (select id from public.portfolios where name = 'Created by RPC'),
      'Updated atomically',
      250,
      '[{"ticker":"VOO","shares":3,"purchase_price":500,"sector":"Not Applicable","asset_type":"ETF","investment_category":"Broad Market","company_name":"Vanguard S&P 500 ETF"}]'::jsonb,
      'EUR',
      'SPY'
    )
  ),
  1,
  'the owner can atomically update a portfolio'
);

select results_eq(
  $$select p.base_currency, pp.ticker, pp.asset_type, pp.investment_category
    from public.portfolios p
    join public.portfolio_positions pp on pp.portfolio_id = p.id
    where p.name = 'Updated atomically'$$,
  $$values ('EUR'::text, 'VOO'::text, 'ETF'::text, 'Broad Market'::text)$$,
  'the atomic update stores settings and classification'
);

select is(
  (
    select count(*)::integer
    from public.update_portfolio(
      '10000000-0000-0000-0000-000000000002',
      'Attack',
      0,
      '[]'::jsonb
    )
  ),
  0,
  'a user cannot update another portfolio through the RPC'
);

select is(
  (
    select count(*)::integer
    from public.apply_portfolio_transaction(
      (select id from public.portfolios where name = 'Updated atomically'),
      'VOO',
      'buy',
      2,
      550
    )
  ),
  1,
  'the owner can atomically record a transaction'
);

select results_eq(
  $$select shares, purchase_price
    from public.portfolio_positions
    where portfolio_id = (
      select id from public.portfolios where name = 'Updated atomically'
    )
      and ticker = 'VOO'$$,
  $$values (5, 520::numeric)$$,
  'a buy updates quantity and weighted average purchase price'
);

select results_eq(
  $$select ticker, kind, quantity, price
    from public.portfolio_transactions
    where portfolio_id = (
      select id from public.portfolios where name = 'Updated atomically'
    )$$,
  $$values ('VOO'::text, 'buy'::text, 2, 550::numeric)$$,
  'the transaction is persisted in history'
);

select is(
  (
    select count(*)::integer
    from public.portfolio_transactions
    where portfolio_id = '10000000-0000-0000-0000-000000000002'
  ),
  0,
  'a user cannot read another portfolio transaction history'
);

select * from finish();
rollback;
