begin;

create table if not exists external_health_records (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references external_clients(id),
  analysis_id uuid unique references external_transient_report_analyses(id),
  record_type text not null check (record_type in ('LAB_ANALYSIS','MEASUREMENT_SET','ASSESSMENT','CONSULTANT_ENTERED_RECORD','DEVICE_SNAPSHOT')),
  sample_date date,
  report_date date,
  provider_name text,
  analysis_date timestamptz not null,
  actor_type text not null check (actor_type in ('CLIENT','CONSULTANT','SYSTEM','DEVICE')),
  actor_id text,
  provenance text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REMOVED','QUARANTINED')),
  biomarker_count integer not null default 0 check (biomarker_count >= 0),
  removed_by text,
  removed_at timestamptz,
  removal_reason text,
  audit_history jsonb not null default '[]'::jsonb check (jsonb_typeof(audit_history)='array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists external_health_records_scope_idx
  on external_health_records(tenant_id,client_id,coalesce(sample_date,report_date,analysis_date::date) desc,created_at desc);

create table if not exists external_profile_evidence_reviews (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references external_clients(id),
  health_record_id uuid not null references external_health_records(id),
  review_type text not null default 'HEALTH_PROFILE_REVIEW_REQUIRED',
  current_profile_snapshot jsonb not null default '{}'::jsonb,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'OPEN' check (status in ('OPEN','KEPT_CURRENT','PROFILE_UPDATED','NOTE_ADDED','REVIEWED')),
  review_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,client_id,health_record_id,review_type)
);
create index if not exists external_profile_evidence_review_scope_idx
  on external_profile_evidence_reviews(tenant_id,client_id,status,created_at desc);

insert into external_health_records(
  id,tenant_id,client_id,analysis_id,record_type,sample_date,report_date,provider_name,
  analysis_date,actor_type,actor_id,provenance,status,biomarker_count,created_at,updated_at
)
select gen_random_uuid(),a.tenant_id,a.client_id,a.id,'LAB_ANALYSIS',a.report_date,a.report_date,
  a.laboratory_name,coalesce(a.confirmed_at,a.completed_at,a.created_at),
  case when a.upload_source='CLIENT_SELF_REPORTED' then 'CLIENT' else 'CONSULTANT' end,
  a.uploaded_by_user_id,a.upload_source,'ACTIVE',a.confirmed_count,a.created_at,a.updated_at
from external_transient_report_analyses a
where a.status='CONFIRMED'
on conflict(analysis_id) do nothing;

comment on table external_health_records is 'External-only dated evidence-event envelope. Source report bytes are never stored.';
comment on table external_profile_evidence_reviews is 'External-only review workflow; evidence never silently overwrites Client360 profile data.';

commit;
