begin;
select plan(8);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000011', 'analytics-owner@example.com'),
  ('00000000-0000-0000-0000-000000000012', 'analytics-other@example.com');

insert into public.portfolios (id, user_id, name, cash)
values
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'Analytics', 100),
  ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000012', 'Other', 100);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.portfolio_risk_limits (portfolio_id, user_id)
    values (
      '10000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000011'
    )$$,
  'an owner can save analytics risk limits'
);

select lives_ok(
  $$insert into public.portfolio_review_cache (
      portfolio_id, user_id, review, prompt_version, data_version, input_fingerprint
    ) values (
      '10000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000011',
      '{"summary":"Evidence-based review"}',
      'rules-v1',
      'analytics-v1',
      'fixture'
    )$$,
  'an owner can cache a versioned review'
);

select lives_ok(
  $$insert into public.portfolio_events (
      portfolio_id, user_id, ticker, event_type, title, starts_at,
      source_name, verified_at
    ) values (
      '10000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000011',
      'AAPL',
      'user_review',
      'Review thesis',
      now(),
      'User',
      now()
    )$$,
  'an owner can add a verified portfolio event'
);

select is(
  (select count(*)::integer from public.portfolio_risk_limits),
  1,
  'an owner reads only their risk limits'
);

select is(
  (select count(*)::integer from public.portfolio_review_cache),
  1,
  'an owner reads only their cached reviews'
);

select is(
  (select count(*)::integer from public.portfolio_events),
  1,
  'an owner reads only their portfolio events'
);

select throws_ok(
  $$insert into public.portfolio_risk_limits (portfolio_id, user_id)
    values (
      '10000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000011'
    )$$,
  '42501',
  null,
  'an owner cannot attach limits to another portfolio'
);

select throws_ok(
  $$insert into public.portfolio_events (
      portfolio_id, user_id, event_type, title, starts_at, source_name, verified_at
    ) values (
      '10000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000011',
      'user_review',
      'Attack',
      now(),
      'User',
      now()
    )$$,
  '42501',
  null,
  'an owner cannot attach events to another portfolio'
);

select * from finish();
rollback;
