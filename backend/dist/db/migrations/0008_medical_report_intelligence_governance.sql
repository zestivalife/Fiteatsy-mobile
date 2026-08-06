alter table health_reports
  add column if not exists document_hash text;

alter table health_reports
  drop constraint if exists health_reports_processing_status_check;

alter table health_reports
  add constraint health_reports_processing_status_check
  check (
    processing_status in (
      'UPLOADED',
      'PROCESSING',
      'EXTRACTED',
      'EXTRACTION_COMPLETED',
      'VALIDATION_PENDING',
      'VALIDATED',
      'PRIORITIZED',
      'SCORED',
      'PUBLISHED',
      'COMPLETED',
      'FAILED',
      'REVIEW_REQUIRED'
    )
  );

create unique index if not exists health_reports_client_document_hash_active_unique
  on health_reports (client_id, document_hash)
  where document_hash is not null
    and deleted_at is null
    and processing_status <> 'FAILED';

alter table processing_jobs
  drop constraint if exists processing_jobs_status_check;

alter table processing_jobs
  add constraint processing_jobs_status_check
  check (status in ('queued', 'processing', 'extraction_completed', 'validation_pending', 'completed', 'failed', 'review_required'));
