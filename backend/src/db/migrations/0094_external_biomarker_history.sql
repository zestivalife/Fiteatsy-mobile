begin;

alter table external_client_documents drop constraint if exists external_client_document_processing_check;
alter table external_client_documents add constraint external_client_document_processing_check check (processing_status in ('NOT_REQUESTED','QUEUED','PROCESSING','EXTRACTED','REVIEW_REQUIRED','CONFIRMED','FAILED'));
alter table external_client_documents add column if not exists processing_error_message_safe text;
alter table external_client_documents add constraint external_client_document_scope_unique unique(id,tenant_id,client_id);

create table external_report_extraction_runs (
  id uuid primary key,
  tenant_id uuid not null,
  client_id uuid not null,
  document_id uuid not null,
  processing_version text not null,
  status text not null check (status in ('QUEUED','PROCESSING','EXTRACTED','REVIEW_REQUIRED','CONFIRMED','FAILED')),
  report_date date,
  sample_collection_date date,
  laboratory_name text,
  patient_name text,
  patient_age text,
  patient_gender text,
  report_number text,
  warning_codes jsonb not null default '[]'::jsonb,
  error_code text,
  error_message_safe text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint external_report_run_document_scope_fk foreign key(document_id,tenant_id,client_id) references external_client_documents(id,tenant_id,client_id)
);
create index external_report_runs_scope_idx on external_report_extraction_runs(tenant_id,client_id,document_id,created_at desc);

create table external_biomarker_observations (
  id uuid primary key,
  tenant_id uuid not null,
  client_id uuid not null,
  document_id uuid not null,
  extraction_run_id uuid not null references external_report_extraction_runs(id),
  row_identity text not null,
  canonical_biomarker_id text,
  canonical_code text,
  canonical_name text,
  canonical_status text not null check (canonical_status in ('MAPPED','UNMAPPED')),
  raw_test_name text not null,
  raw_value text not null,
  raw_unit text,
  raw_reference_range text,
  raw_flag text,
  raw_section text,
  raw_text_context text,
  numeric_value numeric,
  text_value text,
  canonical_unit text,
  reference_min numeric,
  reference_max numeric,
  reference_text text,
  lab_flag text check (lab_flag is null or lab_flag in ('LOW','NORMAL','HIGH','CRITICAL_LOW','CRITICAL_HIGH','UNKNOWN')),
  observation_date date not null,
  date_source text not null check (date_source in ('SAMPLE_DATE','REPORT_DATE','DOCUMENT_METADATA','UPLOAD_FALLBACK')),
  source text not null default 'LAB_REPORT' check (source='LAB_REPORT'),
  extraction_confidence numeric check (extraction_confidence between 0 and 1),
  mapping_confidence numeric check (mapping_confidence between 0 and 1),
  review_status text not null default 'REVIEW_REQUIRED' check (review_status in ('REVIEW_REQUIRED','CONFIRMED','CORRECTED','REJECTED','IGNORED')),
  corrected_value numeric,
  corrected_unit text,
  corrected_reference_min numeric,
  corrected_reference_max numeric,
  corrected_reference_text text,
  corrected_observation_date date,
  correction_reason text,
  reviewed_by_user_id text references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_biomarker_document_scope_fk foreign key(document_id,tenant_id,client_id) references external_client_documents(id,tenant_id,client_id),
  constraint external_biomarker_row_unique unique(tenant_id,client_id,document_id,extraction_run_id,row_identity)
);
create index external_biomarker_history_idx on external_biomarker_observations(tenant_id,client_id,canonical_biomarker_id,observation_date desc,created_at desc);
create index external_biomarker_review_idx on external_biomarker_observations(tenant_id,client_id,review_status,created_at desc);

alter table external_client_audit_events drop constraint if exists external_client_audit_events_event_type_check;
alter table external_client_audit_events add constraint external_client_audit_events_event_type_check check (event_type in (
  'CLIENT_CREATED','CLIENT_UPDATED','CLIENT_STATUS_CHANGED','CLIENT_INVITATION_CREATED','CLIENT_INVITATION_OPENED','CLIENT_INVITATION_REVOKED','CLIENT_INVITATION_REGENERATED',
  'CLIENT_INTAKE_STARTED','CLIENT_INTAKE_SAVED','CLIENT_INTAKE_SUBMITTED','CLIENT_DOCUMENT_UPLOADED','CLIENT_DOCUMENT_METADATA_UPDATED','CLIENT_DOCUMENT_ARCHIVED','CLIENT_DOCUMENT_VIEWED','CLIENT_DOCUMENT_DOWNLOADED',
  'CLIENT_CONSENT_ACCEPTED','CLIENT_PROFILE_UPDATED','CLIENT_HEALTH_DATA_UPDATED','CLIENT_GOAL_UPDATED','CLIENT_MEASUREMENT_ADDED',
  'REPORT_PROCESSING_STARTED','REPORT_PROCESSING_COMPLETED','REPORT_PROCESSING_FAILED','BIOMARKER_EXTRACTED','BIOMARKER_CONFIRMED','BIOMARKER_CORRECTED','BIOMARKER_REJECTED','REPORT_REPROCESSED'
));

comment on table external_biomarker_observations is 'Tenant-owned immutable raw extraction evidence plus reviewed External Consultant biomarker history.';
commit;
