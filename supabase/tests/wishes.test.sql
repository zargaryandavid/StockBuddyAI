begin;
select plan(10);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000061', 'wisher@example.com'),
  ('00000000-0000-0000-0000-000000000062', 'other-wisher@example.com');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000061","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.wishes (user_id, list, text)
    values ('00000000-0000-0000-0000-000000000061', 'exercise', 'Visit Japan')$$,
  'an owner can add a wish'
);

select throws_ok(
  $$insert into public.wishes (user_id, list, text)
    values ('00000000-0000-0000-0000-000000000061', 'exercise', '  visit   JAPAN! ')$$,
  '23505',
  null,
  'the same wish cannot be added twice, ignoring case, spacing, and punctuation'
);

select lives_ok(
  $$insert into public.wishes (user_id, list, text)
    values ('00000000-0000-0000-0000-000000000061', 'short', 'Visit Japan')$$,
  'the same wish may sit in a different list'
);

select lives_ok(
  $$insert into public.wishes (user_id, list, text)
    values ('00000000-0000-0000-0000-000000000061', 'want', 'A good camera')$$,
  'a wish can go in the Want list'
);

insert into public.wishes (user_id, list, text)
values
  ('00000000-0000-0000-0000-000000000061', 'long', 'First'),
  ('00000000-0000-0000-0000-000000000061', 'long', 'Second'),
  ('00000000-0000-0000-0000-000000000061', 'long', 'Third');

select is(
  public.reorder_wishes(
    'long',
    array(
      select id from public.wishes
      where list = 'long'
      order by case text when 'Third' then 1 when 'First' then 2 else 3 end
    )
  ),
  3,
  'a list can be reordered in one call'
);

select results_eq(
  $$select text from public.wishes where list = 'long' order by position$$,
  $$values ('Third'::text), ('First'::text), ('Second'::text)$$,
  'the list keeps the dragged order'
);

-- Fill the exercise to 300, then one more is refused.
insert into public.wishes (user_id, list, text)
select '00000000-0000-0000-0000-000000000061', 'exercise', 'Wish number ' || n
from generate_series(1, 299) as n;

select throws_ok(
  $$insert into public.wishes (user_id, list, text)
    values ('00000000-0000-0000-0000-000000000061', 'exercise', 'One too many')$$,
  '23514',
  'The 300 wishes exercise is full',
  'the exercise stops at 300 wishes'
);

select throws_ok(
  $$insert into public.wishes (user_id, list, text)
    values ('00000000-0000-0000-0000-000000000062', 'short', 'Not mine')$$,
  '42501',
  null,
  'users cannot add wishes for someone else'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000062","role":"authenticated"}',
  true
);

select is_empty('select id from public.wishes', 'users cannot see other users wishes');

select lives_ok(
  $$insert into public.wishes (user_id, list, text)
    values ('00000000-0000-0000-0000-000000000062', 'exercise', 'Visit Japan')$$,
  'another user can have the same wish'
);

select * from finish();
rollback;
