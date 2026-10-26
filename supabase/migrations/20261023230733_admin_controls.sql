create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  max_position_pct numeric(5, 4) not null default 0.2500
    check (max_position_pct > 0 and max_position_pct <= 1),
  deep_value_weight numeric(5, 4) not null default 0.7000
    check (deep_value_weight > 0 and deep_value_weight < 1),
  trajectory_weight numeric(5, 4) not null default 0.3000
    check (trajectory_weight > 0 and trajectory_weight < 1),
  llm_model text not null default 'claude-opus-5-5'
    check (char_length(llm_model) between 1 and 80 and position(' ' in llm_model) = 0),
  updated_at timestamptz not null default now(),
  constraint app_settings_weights_sum
    check (deep_value_weight + trajectory_weight = 1)
);

insert into public.app_settings (id) values (1);

create table public.persona_prompts (
  persona text primary key
    check (persona in ('graham', 'buffett', 'munger', 'lynch', 'druckenmiller')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  strategy text not null check (strategy in ('deep-value', 'trajectory')),
  prompt text not null check (char_length(prompt) between 40 and 12000),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
alter table public.persona_prompts enable row level security;

revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.persona_prompts from anon, authenticated;
grant select, insert, update, delete on table public.app_settings to service_role;
grant select, insert, update, delete on table public.persona_prompts to service_role;

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function private.set_updated_at();

create trigger persona_prompts_set_updated_at
before update on public.persona_prompts
for each row execute function private.set_updated_at();
