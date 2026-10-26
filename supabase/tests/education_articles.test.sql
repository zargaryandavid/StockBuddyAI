begin;
select plan(5);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000051', 'reader@example.com');

insert into public.education_articles (title, body, published)
values
  ('Why index funds', 'Low cost and broad.', true),
  ('Draft article', 'Not ready yet.', false);

select throws_ok(
  $$insert into public.education_articles (title, body, image_path)
    values ('Bad', 'Body', '../secrets.png')$$,
  '23514',
  null,
  'a picture path must stay inside the articles folder'
);

select is(
  (select public from storage.buckets where id = 'education'),
  true,
  'article pictures live in a public bucket'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}',
  true
);

select results_eq(
  'select title from public.education_articles',
  $$values ('Why index funds'::text)$$,
  'users see published articles only'
);

select throws_ok(
  $$insert into public.education_articles (title, body) values ('Mine', 'Body')$$,
  '42501',
  null,
  'users cannot write articles'
);

select throws_ok(
  $$update public.education_articles set title = 'Changed'$$,
  '42501',
  null,
  'users cannot change articles'
);

select * from finish();
rollback;
