alter table health_report_files
  add column if not exists file_size bigint;

update health_report_files
set file_size = octet_length(content)
where file_size is null;

alter table health_report_files
  alter column file_size set not null;
