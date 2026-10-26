-- Email reminders for an upcoming company report. The recipient is always the
-- signed-in user's own email, taken from their session token, never from input.
create table public.report_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z0-9.-]{1,12}$'),
  company_name text check (company_name is null or char_length(company_name) <= 200),
  last_report_date date,
  remind_on date not null,
  email text not null default (auth.jwt() ->> 'email')
    check (char_length(email) between 3 and 320),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, ticker, remind_on)
);

create index report_reminders_due_idx
  on public.report_reminders (remind_on)
  where status = 'pending';

alter table public.report_reminders enable row level security;

revoke all on table public.report_reminders from anon, authenticated;
grant select, delete on table public.report_reminders to authenticated;
-- Users choose what and when; email, status, and delivery fields are server-owned.
grant insert (user_id, portfolio_id, ticker, company_name, last_report_date, remind_on)
  on table public.report_reminders to authenticated;

create policy report_reminders_select_own on public.report_reminders
for select to authenticated using ((select auth.uid()) = user_id);

create policy report_reminders_insert_own on public.report_reminders
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and remind_on >= current_date
  and (
    portfolio_id is null
    or exists (
      select 1 from public.portfolios
      where portfolios.id = report_reminders.portfolio_id
        and portfolios.user_id = (select auth.uid())
    )
  )
);

create policy report_reminders_delete_own on public.report_reminders
for delete to authenticated using ((select auth.uid()) = user_id);
