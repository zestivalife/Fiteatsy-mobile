alter table health_reports
  add column if not exists deleted_by text references users(id) on delete set null;

alter table health_reports
  drop constraint if exists health_reports_processing_status_check;

alter table health_reports
  add constraint health_reports_processing_status_check
  check (
    processing_status in (
      'UPLOADED',
      'PROCESSING',
      'DOCUMENT_ANALYSIS_COMPLETED',
      'EXTRACTION_COMPLETED',
      'VALIDATION_COMPLETED',
      'PRIORITIZATION_COMPLETED',
      'SCORE_GENERATED',
      'PUBLISHED',
      'PARTIALLY_VALIDATED',
      'FAILED',
      'REVIEW_REQUIRED',
      'INSUFFICIENT_DATA',
      'DELETED',
      -- Backward-compatible states retained for historical records.
      'EXTRACTED',
      'VALIDATION_PENDING',
      'VALIDATED',
      'PRIORITIZED',
      'SCORED',
      'COMPLETED'
    )
  );

create index if not exists health_reports_deleted_recovery_idx
  on health_reports (deleted_at)
  where processing_status = 'DELETED' and deleted_at is not null;
