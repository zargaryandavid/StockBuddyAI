begin;
select plan(4);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000041', 'profile-owner@example.com'),
  ('00000000-0000-0000-0000-000000000042', 'profile-other@example.com');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.user_profiles (user_id, date_of_birth)
    values ('00000000-0000-0000-0000-000000000041', '1987-05-10')$$,
  'an owner can save a date of birth'
);

select throws_ok(
  $$update public.user_profiles set date_of_birth = current_date + 1
    where user_id = '00000000-0000-0000-0000-000000000041'$$,
  '23514',
  null,
  'a date of birth cannot be in the future'
);

select throws_ok(
  $$insert into public.user_profiles (user_id, date_of_birth)
    values ('00000000-0000-0000-0000-000000000042', '1990-01-01')$$,
  '42501',
  null,
  'users cannot create a profile for someone else'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000042","role":"authenticated"}',
  true
);

select is_empty('select user_id from public.user_profiles', 'users cannot see other profiles');

select * from finish();
rollback;
