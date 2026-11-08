drop index if exists consultant_client_assignments_active_unique;

create unique index if not exists consultant_client_assignments_active_tenant_unique
  on consultant_client_assignments (tenant_id, consultant_user_id, client_user_id, scope)
  where status = 'active';
