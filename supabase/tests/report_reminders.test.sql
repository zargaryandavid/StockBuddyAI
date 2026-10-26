begin;
select plan(7);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000021', 'reminder-owner@example.com'),
  ('00000000-0000-0000-0000-000000000022', 'reminder-other@example.com');

insert into public.portfolios (id, user_id, name, cash)
values
  ('10000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', 'Mine', 100),
  ('10000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000022', 'Theirs', 100);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated","email":"reminder-owner@example.com"}',
  true
);

select lives_ok(
  $$insert into public.report_reminders (user_id, portfolio_id, ticker, remind_on)
    values (
      '00000000-0000-0000-0000-000000000021',
      '10000000-0000-0000-0000-000000000021',
      'AAPL',
      current_date + 30
    )$$,
  'an owner can request a reminder'
);

select results_eq(
  $$select email, status from public.report_reminders where ticker = 'AAPL'$$,
  $$values ('reminder-owner@example.com'::text, 'pending'::text)$$,
  'the reminder goes to the session email and starts pending'
);

select throws_ok(
  $$insert into public.report_reminders (user_id, ticker, remind_on, email)
    values ('00000000-0000-0000-0000-000000000021', 'MSFT', current_date + 1, 'victim@example.com')$$,
  '42501',
  null,
  'users cannot choose the recipient email'
);

select throws_ok(
  $$insert into public.report_reminders (user_id, portfolio_id, ticker, remind_on)
    values (
      '00000000-0000-0000-0000-000000000021',
      '10000000-0000-0000-0000-000000000022',
      'MSFT',
      current_date + 1
    )$$,
  '42501',
  null,
  'users cannot attach a reminder to another portfolio'
);

select throws_ok(
  $$insert into public.report_reminders (user_id, ticker, remind_on)
    values ('00000000-0000-0000-0000-000000000021', 'MSFT', current_date - 1)$$,
  '42501',
  null,
  'reminders cannot be scheduled in the past'
);

select throws_ok(
  $$update public.report_reminders set status = 'sent'$$,
  '42501',
  null,
  'users cannot change delivery status'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated","email":"reminder-other@example.com"}',
  true
);

select is_empty(
  'select id from public.report_reminders',
  'users cannot see other users reminders'
);

select * from finish();
rollback;
