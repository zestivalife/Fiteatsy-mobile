create table if not exists qa_fixture_sets (
  id uuid primary key,
  fixture_code text not null unique,
  environment text not null,
  purpose text not null,
  status text not null default 'DRAFT',
  created_by_actor text not null,
  expires_at timestamptz not null,
  deactivated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  audit_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qa_fixture_sets_environment_check check (environment = 'PRODUCTION_QA'),
  constraint qa_fixture_sets_purpose_check check (purpose = 'COMMON_FOOD_ENGINE_E2E'),
  constraint qa_fixture_sets_status_check check (status in ('DRAFT', 'ACTIVE', 'DEACTIVATED', 'EXPIRED'))
);

create table if not exists qa_fixture_entities (
  fixture_set_id uuid not null references qa_fixture_sets(id) on delete restrict,
  entity_type text not null,
  entity_id text not null,
  fixture_role text not null,
  created_at timestamptz not null default now(),
  primary key (fixture_set_id, entity_type, entity_id)
);

create index if not exists qa_fixture_sets_active_idx
  on qa_fixture_sets (purpose, status, expires_at desc);

create index if not exists qa_fixture_entities_lookup_idx
  on qa_fixture_entities (entity_type, entity_id);

