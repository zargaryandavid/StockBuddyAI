begin;
select plan(6);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000091', 'sharer@example.com'),
  ('00000000-0000-0000-0000-000000000092', 'other-sharer@example.com');
insert into public.portfolios (id, user_id, name, cash)
values
  ('91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000091', 'Mine', 0),
  ('92000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000092', 'Theirs', 0);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000091","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.share_links (token, user_id, kind, portfolio_id)
    values ('fire_token_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '00000000-0000-0000-0000-000000000091', 'fire', '91000000-0000-0000-0000-000000000001')$$,
  'an owner can share their FIRE plan'
);

select throws_ok(
  $$insert into public.share_links (token, user_id, kind)
    values ('fire_token_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '00000000-0000-0000-0000-000000000091', 'fire')$$,
  '23505',
  null,
  'only one FIRE link per person'
);

select throws_ok(
  $$insert into public.share_links (token, user_id, kind, portfolio_id)
    values ('port_token_cccccccccccccccccccccccccccccc', '00000000-0000-0000-0000-000000000091', 'portfolio', '92000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'nobody can share someone else''s portfolio'
);

select throws_ok(
  $$insert into public.share_links (token, user_id, kind, portfolio_id)
    values ('short', '00000000-0000-0000-0000-000000000091', 'portfolio', '91000000-0000-0000-0000-000000000001')$$,
  '23514',
  null,
  'tokens must be long and random-looking'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000092","role":"authenticated"}',
  true
);
select is_empty('select token from public.share_links', 'users cannot see other people''s links');

reset role;
set local role anon;
select throws_ok('select token from public.share_links', '42501', null, 'visitors cannot list links');

select * from finish();
rollback;
