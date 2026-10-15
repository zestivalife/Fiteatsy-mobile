begin;
alter table external_transient_report_analyses add column if not exists excluded_count integer not null default 0;
alter table external_confirmed_biomarkers
  add column if not exists source_page integer,
  add column if not exists source_test_name text,
  add column if not exists source_section_precedence text,
  add column if not exists panel text,
  add column if not exists provenance text,
  add column if not exists upload_source text,
  add column if not exists laboratory_name text,
  add column if not exists quarantined_at timestamptz,
  add column if not exists quarantine_reason text;
comment on column external_confirmed_biomarkers.source_page is 'External transient source page evidence only; source bytes are not retained.';
commit;
