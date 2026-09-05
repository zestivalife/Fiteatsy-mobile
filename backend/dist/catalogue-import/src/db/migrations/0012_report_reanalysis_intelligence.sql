alter table health_reports
  add column if not exists analysis_attempts jsonb not null default '[]'::jsonb;

create table if not exists health_report_files (
  report_id text primary key references health_reports(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  mime_type text not null,
  original_filename text not null,
  content bytea not null,
  created_at timestamptz not null default now(),
  constraint health_report_files_client_owner_fk
    foreign key (client_id, user_id)
    references fiteatsy_clients (id, account_user_id)
    on delete restrict
);

create index if not exists health_report_files_client_report_idx
  on health_report_files (client_id, report_id);
