begin;
select plan(3);

select results_eq(
  'select count(*)::integer from public.industries',
  $$values (12)$$,
  'the studio starts with the sector list filled in'
);

select results_eq(
  $$select icon from public.industries where name = 'Information Technology'$$,
  $$values ('cpu'::text)$$,
  'each industry includes a vector icon name'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  'select name from public.industries',
  '42501',
  null,
  'signed-in users cannot read the industry list directly'
);

select * from finish();
rollback;
