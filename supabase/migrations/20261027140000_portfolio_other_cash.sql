-- Cash a portfolio holds in currencies other than its own, e.g. [{"currency":"AMD","amount":500000}].
-- The main "cash" column stays the cash in the portfolio's own currency.
alter table public.portfolios
  add column other_cash jsonb not null default '[]'::jsonb
    check (jsonb_typeof(other_cash) = 'array' and jsonb_array_length(other_cash) <= 10);
