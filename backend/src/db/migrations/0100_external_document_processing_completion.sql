begin;

alter table external_client_documents
  add column if not exists processing_completed_at timestamptz;

comment on column external_client_documents.processing_completed_at is
  'Terminal completion timestamp for the canonical External Consultant report-processing lifecycle.';

commit;
