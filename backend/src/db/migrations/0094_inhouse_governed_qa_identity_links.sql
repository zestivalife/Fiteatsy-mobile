create table if not exists inhouse_qa_identity_links (
  id uuid primary key,
  fixture_key text not null unique,
  auth_identity_id uuid not null unique,
  application_user_id text not null unique references users(id) on delete restrict,
  classification text not null default 'GOVERNED_QA_INHOUSE'
    check (classification = 'GOVERNED_QA_INHOUSE'),
  canonical_role text not null check (canonical_role in (
    'user','consultant','provider','dietician','senior_consultant',
    'practitioner','mentor','admin','super_admin','platform_owner'
  )),
  status text not null default 'active' check (status in ('active','disabled')),
  created_by_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inhouse_qa_identity_links_active_auth_idx
  on inhouse_qa_identity_links(auth_identity_id)
  where status = 'active';

comment on table inhouse_qa_identity_links is
  'Explicit QA-only Auth identity to Fiteatsy application-user mapping. Never used for ordinary production identity matching.';
