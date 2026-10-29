alter table consultant_client_assignments
  add column if not exists created_by_actor_reference text,
  add column if not exists revoked_by_actor_reference text;

alter table professional_assignment_audit_events
  add column if not exists actor_reference text;

create index if not exists professional_assignment_audit_actor_reference_idx
  on professional_assignment_audit_events (actor_reference, created_at desc)
  where actor_reference is not null;
