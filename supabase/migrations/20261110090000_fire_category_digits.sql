-- Category keys can contain digits (the 529 education savings account is college_529), which the
-- original letters-and-underscores check refused, so 529 accounts could not be saved.
alter table public.fire_entries drop constraint if exists fire_entries_category_check;
alter table public.fire_entries
  add constraint fire_entries_category_check check (category ~ '^[a-z0-9_]{1,40}$');
