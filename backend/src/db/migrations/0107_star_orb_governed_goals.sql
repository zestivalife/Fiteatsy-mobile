create table if not exists governed_wellness_goals (
  id uuid primary key,
  user_id text not null references users(id),
  client_id text not null references fiteatsy_clients(id),
  tenant_id uuid not null references tenants(id),
  goal_kind text not null check (goal_kind in ('steps','exercise_minutes','mindfulness_minutes','mind_sessions')),
  goal_value numeric(12,2) not null check (goal_value > 0),
  unit text not null check (unit in ('steps','minutes','sessions')),
  source text not null check (source in ('USER','CONSULTANT')),
  status text not null check (status in ('active','superseded','revoked')),
  approved boolean not null default true,
  effective_from date not null,
  effective_through date,
  revision integer not null check (revision > 0),
  supersedes_goal_id uuid references governed_wellness_goals(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_through is null or effective_through >= effective_from),
  unique (client_id, goal_kind, source, revision)
);

create unique index if not exists governed_wellness_goals_one_active
  on governed_wellness_goals (client_id, goal_kind, source)
  where status = 'active';
create index if not exists governed_wellness_goals_history
  on governed_wellness_goals (client_id, goal_kind, effective_from desc, revision desc);
