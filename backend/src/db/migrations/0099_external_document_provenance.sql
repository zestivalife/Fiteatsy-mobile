begin;

alter table external_client_documents drop constraint if exists external_client_document_source_check;
update external_client_documents set source='CLIENT_SELF_REPORTED' where source='CLIENT_INTAKE_UPLOAD';
update external_client_documents set source='CONSULTANT_UPLOADED' where source='CONSULTANT_UPLOAD';
alter table external_client_documents add constraint external_client_document_source_check
  check (source in ('CLIENT_SELF_REPORTED','CONSULTANT_UPLOADED'));

comment on column external_client_documents.source is
  'Immutable uploader provenance. Canonical identity/deduplication is tenant_id + client_id + content_hash.';

commit;
