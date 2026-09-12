create table if not exists food_master_authorisation_decisions (
  source_type text not null,
  source_record_id text not null,
  authorization_status text not null check (authorization_status in ('AUTHORISED','NOT_AUTHORISED')),
  actor_user_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_type, source_record_id)
);

create table if not exists food_master_authorisation_audit (
  id uuid primary key,
  source_type text not null,
  source_record_id text not null,
  previous_status text not null check (previous_status in ('PENDING','AUTHORISED','NOT_AUTHORISED')),
  new_status text not null check (new_status in ('AUTHORISED','NOT_AUTHORISED')),
  actor_user_id text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists food_master_authorisation_audit_source_idx
  on food_master_authorisation_audit(source_type, source_record_id, created_at desc);
