begin;
select plan(3);

insert into public.app_connections (connection, field, value_encrypted)
values ('anthropic', 'api_key', 'gAAAA-encrypted');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000071', 'reader@example.com');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","role":"authenticated"}',
  true
);

select throws_ok(
  'select * from public.app_connections',
  '42501',
  null,
  'signed-in users cannot read connection secrets'
);

select throws_ok(
  $$insert into public.app_connections (connection, field, value_encrypted) values ('x', 'y', 'z')$$,
  '42501',
  null,
  'signed-in users cannot write connection settings'
);

reset role;
select is(
  (select count(*)::int from public.app_connections where connection = 'anthropic'),
  1,
  'the service side can read them'
);

select * from finish();
rollback;
