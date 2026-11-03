alter table consultant_client_assignments
  add column if not exists tenant_id uuid;

update consultant_client_assignments assignment
   set tenant_id = client.tenant_id
  from fiteatsy_clients client
 where client.account_user_id = assignment.client_user_id
   and client.deleted_at is null
   and assignment.tenant_id is null;

do $$
begin
  if exists (
    select 1
      from consultant_client_assignments
     where tenant_id is null
  ) then
    raise exception 'ASSIGNMENT_TENANT_BACKFILL_INCOMPLETE';
  end if;
end $$;

alter table consultant_client_assignments
  alter column tenant_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'consultant_client_assignments_tenant_fk'
  ) then
    alter table consultant_client_assignments
      add constraint consultant_client_assignments_tenant_fk
      foreign key (tenant_id) references tenants(id) on delete restrict;
  end if;
end $$;

create index if not exists consultant_client_assignments_tenant_status_idx
  on consultant_client_assignments (tenant_id, status, updated_at desc);
