create table if not exists mind_check_in_composites (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  health_day date not null,
  questionnaire_version text not null,
  answers jsonb not null,
  questionnaire_score numeric(6,2) not null,
  methodology_version text not null,
  source_components jsonb not null default '{}'::jsonb,
  composite_score numeric(6,2),
  score_status text not null,
  component_coverage numeric(6,2) not null,
  inputs_used jsonb not null default '[]'::jsonb,
  inputs_missing jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_id, health_day, methodology_version),
  foreign key(client_id,user_id) references fiteatsy_clients(id,account_user_id) on delete cascade
);
create index if not exists idx_mind_check_in_owner_day on mind_check_in_composites(user_id,client_id,health_day desc);
