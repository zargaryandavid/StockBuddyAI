alter table public.app_settings
  add column use_transaction_history_analytics boolean not null default true;
