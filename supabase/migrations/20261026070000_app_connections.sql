-- Outside-service settings an admin saves in Admin -> Connections (API keys, email
-- server, SEC contact). Values are encrypted by the API before they are stored, and only
-- the service role can read or write them: no grants or policies for signed-in users.
create table public.app_connections (
  connection text not null check (connection ~ '^[a-z_]{1,40}$'),
  field text not null check (field ~ '^[a-z_]{1,40}$'),
  value_encrypted text not null check (char_length(value_encrypted) between 1 and 8000),
  updated_at timestamptz not null default now(),
  primary key (connection, field)
);

alter table public.app_connections enable row level security;
revoke all on table public.app_connections from anon, authenticated;
