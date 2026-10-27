-- Book-wide cash target: portfolios without their own Min cash use this.
alter table public.app_settings
  add column min_cash_pct numeric(5, 4) not null default 0.0500
    check (min_cash_pct >= 0 and min_cash_pct <= 1);
