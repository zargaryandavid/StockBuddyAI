-- The country the person lives in, as a two-letter code (US, AM, … or ZZ for another
-- country). The money to-do list and FIRE account types follow it: a Roth IRA and 529 only
-- make sense in the United States, while Armenia has deposits and pension savings.
alter table public.user_profiles
  add column country text check (country is null or country ~ '^[A-Z]{2}$');
