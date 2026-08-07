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
      'FAILED',
      'REVIEW_REQUIRED',
      'INSUFFICIENT_DATA',
      -- Backward-compatible states retained for historical records.
      'EXTRACTED',
      'VALIDATION_PENDING',
      'VALIDATED',
      'PRIORITIZED',
      'SCORED',
      'COMPLETED'
    )
  );
