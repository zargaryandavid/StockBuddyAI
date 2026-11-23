-- A Roth IRA account can record how much was put in during a given year (for example
-- $2,000 deposited before the account was added), so the money to-do list counts it
-- towards that year's IRA limit alongside the regular contributions from pay.
alter table public.fire_entries
  add column contributed numeric(14, 2) check (contributed is null or contributed >= 0),
  add column contributed_year smallint check (contributed_year is null or contributed_year between 2000 and 2100),
  add constraint fire_entries_contributed_with_year
    check ((contributed is null) = (contributed_year is null));
