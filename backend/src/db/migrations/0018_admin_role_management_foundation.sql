create table if not exists role_audit_events (
  id uuid primary key,
  performed_by_user_id text references users(id) on delete set null,
  target_user_id text not null references users(id) on delete cascade,
  old_role text,
  new_role text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists role_audit_events_target_user_id_idx
  on role_audit_events (target_user_id, created_at desc);

create index if not exists role_audit_events_performed_by_user_id_idx
  on role_audit_events (performed_by_user_id, created_at desc)
  where performed_by_user_id is not null;
