begin;
select plan(9);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000041', 'asset-owner@example.com'),
  ('00000000-0000-0000-0000-000000000042', 'asset-other@example.com');

insert into public.fire_assets (id, user_id, asset_type, name, market_value)
values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'residential', 'Condo', 350000),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000042', 'land', 'Lot', 90000);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.fire_assets (user_id, asset_type, name, market_value)
    values ('00000000-0000-0000-0000-000000000041', 'vehicle', 'Rental car', 18000)$$,
  'an owner can add an asset'
);

select lives_ok(
  $$insert into public.fire_assets (user_id, asset_type, name, location)
    values ('00000000-0000-0000-0000-000000000041', 'land', 'Lot', 'Dilijan, Armenia')$$,
  'an asset can record its location'
);

select throws_ok(
  $$insert into public.fire_assets (user_id, asset_type, name, location)
    values ('00000000-0000-0000-0000-000000000041', 'land', 'Lot', repeat('x', 201))$$,
  '23514',
  null,
  'a location is at most 200 characters'
);

select throws_ok(
  $$insert into public.fire_assets (user_id, asset_type, name)
    values ('00000000-0000-0000-0000-000000000041', 'boat', 'Boat')$$,
  '23514',
  null,
  'the asset type must be a known rental type'
);

select lives_ok(
  $$insert into public.fire_entries (user_id, kind, category, name, amount, starts_on, asset_id)
    values ('00000000-0000-0000-0000-000000000041', 'income', 'rent_income', 'Condo rent', 1800,
            '2026-11-05', '40000000-0000-0000-0000-000000000001')$$,
  'a rental income can link to the owner''s asset'
);

select throws_ok(
  $$insert into public.fire_entries (user_id, kind, category, name, amount, starts_on, asset_id)
    values ('00000000-0000-0000-0000-000000000041', 'income', 'rent_income', 'Lot rent', 100,
            '2026-11-05', '40000000-0000-0000-0000-000000000002')$$,
  '23503',
  null,
  'an income cannot link to someone else''s asset'
);

select results_eq(
  'select name from public.fire_assets order by name',
  $$values ('Condo'::text), ('Lot'::text), ('Rental car'::text)$$,
  'users only see their own assets'
);

delete from public.fire_assets where id = '40000000-0000-0000-0000-000000000001';

select results_eq(
  $$select asset_id, user_id from public.fire_entries where name = 'Condo rent'$$,
  $$values (null::uuid, '00000000-0000-0000-0000-000000000041'::uuid)$$,
  'deleting an asset unlinks its income and keeps the entry'
);

select throws_ok(
  $$insert into public.fire_assets (user_id, asset_type, name)
    values ('00000000-0000-0000-0000-000000000042', 'land', 'Not mine')$$,
  '42501',
  null,
  'users cannot add assets for someone else'
);

select * from finish();
rollback;
