-- External Consultant P0 hardening. Expand-only and isolated from ZESTIVA_INTERNAL contracts.
alter table external_client_documents
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists processing_started_at timestamptz;

alter table external_client_documents
  drop constraint if exists external_client_document_processing_check;

-- Normalise the legacy upload state before installing the stricter lifecycle.
update external_client_documents
set processing_status = 'QUEUED'
where category = 'LAB_REPORT' and processing_status = 'UPLOADED';

alter table external_client_documents
  add constraint external_client_document_processing_check
  check (processing_status in (
    'NOT_REQUESTED','QUEUED','PROCESSING','EXTRACTED',
    'REVIEW_REQUIRED','CONFIRMED','FAILED','NOT_APPLICABLE'
  ));
