create table if not exists qa_admin_session_handoffs (
  id uuid primary key,
  code_digest text not null unique,
  target_user_id text not null references users(id) on delete restrict,
  purpose text not null,
  status text not null default 'pending',
  actor_reference text not null,
  audit_reference uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint qa_admin_session_handoffs_purpose_check
    check (purpose = 'qa_admin_session_handoff'),
  constraint qa_admin_session_handoffs_status_check
    check (status in ('pending', 'consumed', 'expired', 'revoked')),
  constraint qa_admin_session_handoffs_expiry_check
    check (expires_at > created_at),
  constraint qa_admin_session_handoffs_consumption_check
    check ((status = 'consumed' and consumed_at is not null) or (status <> 'consumed' and consumed_at is null))
);

create index if not exists qa_admin_session_handoffs_target_idx
  on qa_admin_session_handoffs (target_user_id, created_at desc);

create index if not exists qa_admin_session_handoffs_pending_expiry_idx
  on qa_admin_session_handoffs (expires_at)
  where status = 'pending';
