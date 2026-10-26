begin;
select plan(9);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000081', 'ai-user@example.com'),
  ('00000000-0000-0000-0000-000000000082', 'ai-other@example.com');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated"}',
  true
);

select ok(public.use_ai_feature('wish_check', 2), 'the first use is allowed');
select ok(public.use_ai_feature('wish_check', 2), 'the second use is allowed');
select ok(not public.use_ai_feature('wish_check', 2), 'the third use is over the daily limit');
select ok(not public.use_ai_feature('ai_review', 0), 'a limit of 0 turns the feature off');

select ok(public.use_ai_feature('ai_review', 1), 'one review token in the month');
select ok(not public.use_ai_feature('ai_review', 1), 'the monthly review allowance is used up');
select is(
  (select day from public.ai_usage where feature = 'ai_review'),
  date_trunc('month', now() at time zone 'utc')::date,
  'review tokens are counted for the whole month'
);

select throws_ok(
  $$update public.ai_usage set count = 0$$,
  '42501',
  null,
  'users cannot reset their own counts'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated"}',
  true
);
select ok(public.use_ai_feature('wish_check', 2), 'each user has their own limit');

select * from finish();
rollback;
