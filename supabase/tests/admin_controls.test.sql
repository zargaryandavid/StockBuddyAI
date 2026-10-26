begin;
select plan(5);

select results_eq(
  'select max_position_pct::text, deep_value_weight::text, trajectory_weight::text from public.app_settings',
  $$values ('0.2500'::text, '0.7000'::text, '0.3000'::text)$$,
  'the studio starts from the long-book defaults'
);

select col_not_null(
  'public', 'app_settings', 'use_transaction_history_analytics',
  'the transaction-history analytics setting is required'
);

select results_eq(
  'select use_transaction_history_analytics from public.app_settings',
  $$values (true)$$,
  'transaction-history analytics starts enabled'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  'select max_position_pct from public.app_settings',
  '42501',
  null,
  'signed-in users cannot read studio settings directly'
);

select throws_ok(
  $$insert into public.persona_prompts (persona, display_name, strategy, prompt)
    values ('graham', 'Benjamin Graham', 'deep-value', repeat('x', 40))$$,
  '42501',
  null,
  'signed-in users cannot write persona prompts'
);

select * from finish();
rollback;
