create table consultant_food_proposals (
  id uuid primary key,
  proposed_name text not null,
  normalized_name text not null,
  category text not null,
  food_state text,
  preparation_state text,
  serving_basis jsonb not null,
  nutrients jsonb not null,
  notes text,
  preparation_notes text,
  proposed_by text not null references users(id),
  status text not null check (status in ('DRAFT','PENDING_REVIEW','CHANGE_REQUESTED','APPROVED','REJECTED')),
  revision integer not null default 1,
  submitted_at timestamptz,
  reviewed_by text references users(id),
  reviewed_at timestamptz,
  review_decision text,
  review_reason text,
  approved_food_id uuid,
  linked_existing_food_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consultant_food_proposals_review_idx on consultant_food_proposals(status,submitted_at);

create table consultant_approved_foods (
  id uuid primary key,
  canonical_name text not null,
  normalized_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  category text not null,
  food_state text,
  preparation_state text,
  serving_basis jsonb not null,
  nutrients jsonb not null,
  version integer not null default 1,
  source_type text not null check(source_type='CONSULTANT_PROPOSAL'),
  source_proposal_id uuid not null unique references consultant_food_proposals(id),
  proposed_by text not null references users(id),
  approved_by text not null references users(id),
  approved_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index consultant_approved_foods_name_idx on consultant_approved_foods(normalized_name) where active;

create table consultant_food_aliases (
  id uuid primary key,
  existing_food_id text not null,
  alias text not null,
  normalized_alias text not null,
  source_proposal_id uuid not null unique references consultant_food_proposals(id),
  approved_by text not null references users(id),
  approved_at timestamptz not null default now(),
  unique(existing_food_id,normalized_alias)
);

create table consultant_food_proposal_audit (
  id uuid primary key,
  proposal_id uuid not null references consultant_food_proposals(id),
  event_type text not null,
  actor_id text not null references users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
