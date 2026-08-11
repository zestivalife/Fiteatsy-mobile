drop index if exists health_reports_client_document_hash_active_unique;

create unique index if not exists health_reports_client_document_hash_active_unique
  on health_reports (client_id, document_hash)
  where document_hash is not null
    and deleted_at is null
    and processing_status not in ('FAILED', 'REVIEW_REQUIRED', 'INSUFFICIENT_DATA');
