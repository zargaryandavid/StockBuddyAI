-- SEC company data (company record, filings, financial figures) kept for a day, so every server
-- copy reads it in one request instead of downloading it again for each stock. Only the API's
-- service role reads or writes it; nothing here belongs to a person.
create table public.market_cache (
  key text primary key check (char_length(key) between 1 and 300),
  value jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.market_cache enable row level security;
revoke all on table public.market_cache from anon, authenticated;
