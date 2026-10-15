begin;

create table external_transient_report_analyses (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references external_clients(id),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  source_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  file_size_bytes integer not null check (file_size_bytes > 0),
  upload_source text not null check (upload_source in ('CLIENT_SELF_REPORTED','CONSULTANT_UPLOADED')),
  uploaded_by_user_id text references users(id),
  processing_version text not null,
  review_token_hash text not null,
  extracted_payload_hash text,
  status text not null check (status in ('PROCESSING','REVIEW_REQUIRED','CONFIRMED','FAILED','EXPIRED')),
  extracted_count integer not null default 0,
  confirmed_count integer not null default 0,
  rejected_count integer not null default 0,
  report_date date,
  laboratory_name text,
  error_code text,
  error_message_safe text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  confirmed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index external_transient_report_scope_idx on external_transient_report_analyses(tenant_id,client_id,created_at desc);
create unique index external_transient_report_confirmed_hash_uq on external_transient_report_analyses(tenant_id,client_id,file_sha256) where status='CONFIRMED';

create table external_confirmed_biomarkers (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references external_clients(id),
  analysis_id uuid not null references external_transient_report_analyses(id),
  row_identity text not null,
  canonical_biomarker_id text,
  canonical_code text,
  canonical_name text,
  raw_test_name text not null,
  raw_value text not null,
  raw_unit text,
  raw_reference_range text,
  raw_flag text,
  raw_section text,
  numeric_value numeric,
  canonical_unit text,
  reference_min numeric,
  reference_max numeric,
  reference_text text,
  lab_flag text,
  observation_date date not null,
  date_source text not null,
  extraction_confidence numeric,
  mapping_confidence numeric,
  review_status text not null check (review_status in ('CONFIRMED','CORRECTED')),
  corrected_payload jsonb,
  reviewed_by_user_id text not null references users(id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(tenant_id,client_id,analysis_id,row_identity)
);
create index external_confirmed_biomarker_history_idx on external_confirmed_biomarkers(tenant_id,client_id,canonical_biomarker_id,observation_date desc);

comment on table external_transient_report_analyses is 'External-only audit envelope; source file bytes and extracted review payloads are never persisted.';
comment on table external_confirmed_biomarkers is 'External-only confirmed structured biomarkers created after transient report review.';
commit;
