update public.industries
set icon = case name
  when 'Communication Services' then 'message-circle'
  when 'Consumer Discretionary' then 'shopping-bag'
  when 'Consumer Staples' then 'shopping-cart'
  when 'Energy' then 'zap'
  when 'Financials' then 'landmark'
  when 'Health Care' then 'heart-pulse'
  when 'Industrials' then 'factory'
  when 'Information Technology' then 'cpu'
  when 'Materials' then 'package-open'
  when 'Real Estate' then 'building-2'
  when 'Utilities' then 'plug-zap'
  else 'shapes'
end;
