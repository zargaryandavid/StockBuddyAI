alter table public.industries
  add column icon text;

update public.industries
set icon = case name
  when 'Communication Services' then '💬'
  when 'Consumer Discretionary' then '🛍️'
  when 'Consumer Staples' then '🛒'
  when 'Energy' then '⚡'
  when 'Financials' then '🏦'
  when 'Health Care' then '🏥'
  when 'Industrials' then '🏭'
  when 'Information Technology' then '💻'
  when 'Materials' then '🧱'
  when 'Real Estate' then '🏢'
  when 'Utilities' then '🔌'
  else '🧩'
end;

alter table public.industries
  alter column icon set not null,
  add constraint industries_icon_length
    check (char_length(icon) between 1 and 16),
  drop column position_pct;
