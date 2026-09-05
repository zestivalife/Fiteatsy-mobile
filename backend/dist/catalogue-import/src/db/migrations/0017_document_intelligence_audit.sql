create table if not exists document_intelligence_audit (
  id bigserial primary key,
  report_id text not null references health_reports(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  trigger_source text not null,
  provider text not null,
  model text not null,
  cost_estimate numeric,
  created_at timestamptz not null default now(),
  constraint document_intelligence_audit_allowed_trigger_chk
    check (trigger_source = 'USER_REANALYZE'),
  constraint document_intelligence_audit_client_owner_fk
    foreign key (client_id, user_id)
    references fiteatsy_clients (id, account_user_id)
    on delete restrict
);

create index if not exists document_intelligence_audit_report_idx
  on document_intelligence_audit (report_id, created_at desc);

create index if not exists document_intelligence_audit_client_trigger_idx
  on document_intelligence_audit (client_id, trigger_source, created_at desc);
