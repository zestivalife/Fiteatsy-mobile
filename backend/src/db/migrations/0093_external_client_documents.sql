begin;

alter table external_client_intake_documents rename to external_client_documents;
alter table external_client_documents alter column intake_id drop not null;
alter table external_client_documents alter column invitation_id drop not null;
alter table external_client_documents rename column original_file_name to original_filename;
alter table external_client_documents rename column file_size to file_size_bytes;
alter table external_client_documents rename column document_hash to content_hash;
alter table external_client_documents rename column provenance to source;
alter table external_client_documents drop constraint if exists external_client_intake_documents_category_check;
alter table external_client_documents drop constraint if exists external_client_intake_documents_provenance_check;
alter table external_client_documents add column if not exists display_name text;
alter table external_client_documents add column if not exists storage_reference text;
alter table external_client_documents add column if not exists uploaded_by_user_id text references users(id);
alter table external_client_documents add column if not exists uploaded_via_intake_id uuid;
alter table external_client_documents add column if not exists document_date date;
alter table external_client_documents add column if not exists provider_name text;
alter table external_client_documents add column if not exists notes text;
alter table external_client_documents add column if not exists status text not null default 'ACTIVE';
alter table external_client_documents add column if not exists processing_status text not null default 'NOT_REQUESTED';
alter table external_client_documents add column if not exists processing_version text;
alter table external_client_documents add column if not exists extraction_job_id text;
alter table external_client_documents add column if not exists extraction_started_at timestamptz;
alter table external_client_documents add column if not exists extraction_completed_at timestamptz;
alter table external_client_documents add column if not exists extraction_error_code text;
alter table external_client_documents add column if not exists updated_at timestamptz not null default now();
alter table external_client_documents add column if not exists uploaded_at timestamptz not null default now();
alter table external_client_documents add constraint external_client_document_category_check check (category in ('LAB_REPORT','PRESCRIPTION','MEDICAL_REPORT','IMAGING_REPORT','DISCHARGE_SUMMARY','OTHER_HEALTH_DOCUMENT'));
alter table external_client_documents add constraint external_client_document_status_check check (status in ('ACTIVE','ARCHIVED'));
alter table external_client_documents add constraint external_client_document_processing_check check (processing_status in ('NOT_REQUESTED','QUEUED','PROCESSING','COMPLETED','FAILED'));
update external_client_documents set source='CLIENT_INTAKE_UPLOAD',display_name=original_filename,storage_reference=id::text,uploaded_via_intake_id=intake_id,uploaded_at=created_at where source='CLIENT_SELF_REPORTED';
alter table external_client_documents add constraint external_client_document_source_check check (source in ('CLIENT_INTAKE_UPLOAD','CONSULTANT_UPLOAD'));
alter table external_client_documents alter column display_name set not null;
alter table external_client_documents alter column storage_reference set not null;
create unique index external_client_document_client_hash_unique on external_client_documents(tenant_id,client_id,content_hash) where status='ACTIVE';
create index external_client_documents_active_list_idx on external_client_documents(tenant_id,client_id,uploaded_at desc) where status='ACTIVE';

alter table external_client_audit_events drop constraint if exists external_client_audit_events_event_type_check;
alter table external_client_audit_events add constraint external_client_audit_events_event_type_check check (event_type in (
  'CLIENT_CREATED','CLIENT_UPDATED','CLIENT_STATUS_CHANGED','CLIENT_INVITATION_CREATED','CLIENT_INVITATION_OPENED','CLIENT_INVITATION_REVOKED','CLIENT_INVITATION_REGENERATED',
  'CLIENT_INTAKE_STARTED','CLIENT_INTAKE_SAVED','CLIENT_INTAKE_SUBMITTED','CLIENT_DOCUMENT_UPLOADED','CLIENT_DOCUMENT_METADATA_UPDATED','CLIENT_DOCUMENT_ARCHIVED','CLIENT_DOCUMENT_VIEWED','CLIENT_DOCUMENT_DOWNLOADED',
  'CLIENT_CONSENT_ACCEPTED','CLIENT_PROFILE_UPDATED','CLIENT_HEALTH_DATA_UPDATED','CLIENT_GOAL_UPDATED','CLIENT_MEASUREMENT_ADDED'
));
comment on table external_client_documents is 'Canonical private external-client document repository for intake and Consultant uploads.';
commit;
