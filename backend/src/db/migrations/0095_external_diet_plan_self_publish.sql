begin;

create table if not exists external_diet_plans (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  client_id uuid not null,
  created_by_user_id text not null references users(id),
  status text not null check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  current_version integer not null default 1 check (current_version > 0),
  published_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (tenant_id, client_id),
  foreign key (client_id, tenant_id) references external_clients(id, tenant_id)
);

create table if not exists external_diet_plan_versions (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  plan_id uuid not null references external_diet_plans(id) on delete cascade,
  client_id uuid not null,
  version integer not null check (version > 0),
  status text not null check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  plan_snapshot jsonb not null,
  context_snapshot jsonb not null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (plan_id, version),
  foreign key (client_id, tenant_id) references external_clients(id, tenant_id)
);

create unique index if not exists external_diet_plan_one_published_version
  on external_diet_plan_versions(plan_id) where status='PUBLISHED';
create index if not exists external_diet_plan_client_scope
  on external_diet_plans(tenant_id, client_id, status);

commit;
