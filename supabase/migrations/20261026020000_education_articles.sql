-- Financial articles written in Admin and shown to every user on the Education page.
-- Signed-in users may read published articles; only the API writes them (with the
-- service role, after checking the admin allowlist), so there are no write policies.
create table public.education_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 20000),
  -- Object path inside the public "education" storage bucket.
  image_path text check (image_path is null or image_path ~ '^articles/[A-Za-z0-9._-]{1,120}$'),
  published boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index education_articles_order_idx on public.education_articles (position, created_at desc);

alter table public.education_articles enable row level security;
revoke all on table public.education_articles from anon, authenticated;
grant select on table public.education_articles to authenticated;

create policy education_articles_select_published on public.education_articles
for select to authenticated using (published);

-- Article pictures: public to read so every user's page can show them; uploads go
-- through the API with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'education',
  'education',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;
