-- Star ratings (and an optional short comment) for the books in the Education Library.
-- One review per person per book. The book list itself lives in code.
create table public.book_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null check (book_id ~ '^[a-z0-9-]{1,60}$'),
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- Newest comments per book, for the book's detail view.
create index book_reviews_book_updated_idx on public.book_reviews (book_id, updated_at desc);

alter table public.book_reviews enable row level security;
revoke all on table public.book_reviews from anon, authenticated;
grant select, insert, update, delete on table public.book_reviews to authenticated;
grant select, insert, update, delete on table public.book_reviews to service_role;

create policy book_reviews_select_own on public.book_reviews
for select to authenticated using ((select auth.uid()) = user_id);
create policy book_reviews_insert_own on public.book_reviews
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy book_reviews_update_own on public.book_reviews
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy book_reviews_delete_own on public.book_reviews
for delete to authenticated using ((select auth.uid()) = user_id);

-- Average and count per book for everyone's Top 5. Read only by the API's service role;
-- it runs with the reader's own rights, and signed-in and anonymous users get no access.
create view public.book_rating_summary with (security_invoker = true) as
select
  book_id,
  round(avg(stars)::numeric, 2) as average,
  count(*)::integer as count
from public.book_reviews
group by book_id;

revoke all on table public.book_rating_summary from anon, authenticated;
grant select on table public.book_rating_summary to service_role;
