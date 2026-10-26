-- A "Want" list on the Wishlist page, alongside short-term and long-term wishes.
alter table public.wishes drop constraint wishes_list_check;
alter table public.wishes
  add constraint wishes_list_check check (list in ('short', 'long', 'want', 'exercise'));
