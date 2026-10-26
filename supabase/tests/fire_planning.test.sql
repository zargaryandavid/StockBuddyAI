begin;
select plan(9);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000031', 'fire-owner@example.com'),
  ('00000000-0000-0000-0000-000000000032', 'fire-other@example.com');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.fire_entries (user_id, kind, category, name, amount, frequency, starts_on)
    values ('00000000-0000-0000-0000-000000000031', 'income', 'salary', 'Paycheck', 5000, 'monthly', '2026-11-01')$$,
  'an owner can add an income'
);

select lives_ok(
  $$insert into public.fire_entries (
      user_id, kind, category, name, amount, frequency, starts_on, ends_on, principal, yield_pct
    ) values (
      '00000000-0000-0000-0000-000000000031', 'income', 'bond', 'Treasury', 200,
      'semiannual', '2026-12-15', '2030-12-15', 10000, 4
    )$$,
  'an owner can add a bond with face value, coupon, and maturity'
);

select lives_ok(
  $$insert into public.fire_entries (
      user_id, kind, category, name, amount, frequency, starts_on, principal, yield_pct,
      quantity, unit_price
    ) values (
      '00000000-0000-0000-0000-000000000031', 'income', 'bond', 'AMTLB', 1270750,
      'semiannual', '2026-12-01', 22100000, 11.5, 221, 100000
    )$$,
  'a bond can record its quantity and price per bond'
);

select throws_ok(
  $$insert into public.fire_entries (user_id, kind, category, name, amount, starts_on, quantity)
    values ('00000000-0000-0000-0000-000000000031', 'income', 'bond', 'Bad', 1, '2026-12-01', -1)$$,
  '23514',
  null,
  'a bond quantity cannot be negative'
);

select throws_ok(
  $$insert into public.fire_entries (user_id, kind, category, name, amount, starts_on, ends_on)
    values ('00000000-0000-0000-0000-000000000031', 'expense', 'rent', 'Rent', 100, '2026-11-01', '2026-10-01')$$,
  '23514',
  null,
  'an entry cannot end before it starts'
);

select throws_ok(
  $$insert into public.fire_entries (user_id, kind, category, name, amount, starts_on)
    values ('00000000-0000-0000-0000-000000000032', 'expense', 'rent', 'Rent', 100, '2026-11-01')$$,
  '42501',
  null,
  'users cannot add entries for someone else'
);

select lives_ok(
  $$insert into public.fire_settings (user_id, expected_return_pct)
    values ('00000000-0000-0000-0000-000000000031', 6.5)$$,
  'an owner can save FIRE assumptions'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}',
  true
);

select is_empty('select id from public.fire_entries', 'users cannot see other users entries');
select is_empty('select user_id from public.fire_settings', 'users cannot see other users settings');

select * from finish();
rollback;
