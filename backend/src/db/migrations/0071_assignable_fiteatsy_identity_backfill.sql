-- Add missing assignment identities for active Fiteatsy app accounts.
-- This migration is additive: it never changes users, login state, roles,
-- existing memberships, existing client records, or deleted/inactive records.

with home_tenant as (
  select id from tenants
   where slug = 'zestiva' and tenant_type = 'ZESTIVA_INTERNAL' and lower(status) = 'active'
)
insert into tenant_memberships (
  id, tenant_id, user_id, tenant_role, status, joined_at, created_at, updated_at
)
select gen_random_uuid(), tenant.id, u.id, 'CLIENT', 'active',
       coalesce(u.created_at, now()), now(), now()
  from users u cross join home_tenant tenant
 where u.deleted_at is null
   and lower(coalesce(u.status, '')) = 'active'
   and lower(coalesce(u.role, 'user')) in ('user', 'client')
   and not exists (
     select 1 from tenant_memberships membership
      where membership.tenant_id = tenant.id and membership.user_id = u.id
   )
on conflict (tenant_id, user_id) do nothing;

with home_tenant as (
  select id from tenants
   where slug = 'zestiva' and tenant_type = 'ZESTIVA_INTERNAL' and lower(status) = 'active'
)
insert into fiteatsy_clients (
  id, tenant_id, fiteatsy_client_id, account_user_id, status, version, created_at, updated_at
)
select gen_random_uuid()::text, tenant.id,
       'fc_' || md5(u.id || ':assignable-client:' || gen_random_uuid()::text),
       u.id, 'active', 1, coalesce(u.created_at, now()), now()
  from users u cross join home_tenant tenant
 where u.deleted_at is null
   and lower(coalesce(u.status, '')) = 'active'
   and lower(coalesce(u.role, 'user')) in ('user', 'client')
   and not exists (select 1 from fiteatsy_clients client where client.account_user_id = u.id)
on conflict (account_user_id) do nothing;

-- Professionals need a shared tenant membership to receive assignments.
-- Administrator/owner roles are intentionally absent. Existing memberships,
-- including inactive ones, are preserved for explicit administrative review.
with home_tenant as (
  select id from tenants
   where slug = 'zestiva' and tenant_type = 'ZESTIVA_INTERNAL' and lower(status) = 'active'
)
insert into tenant_memberships (
  id, tenant_id, user_id, tenant_role, status, joined_at, created_at, updated_at
)
select gen_random_uuid(), tenant.id, u.id, 'CONSULTANT', 'active',
       coalesce(u.created_at, now()), now(), now()
  from users u cross join home_tenant tenant
 where u.deleted_at is null
   and lower(coalesce(u.status, '')) = 'active'
   and lower(coalesce(u.role, '')) in (
     'consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor'
   )
   and not exists (
     select 1 from tenant_memberships membership
      where membership.tenant_id = tenant.id and membership.user_id = u.id
   )
on conflict (tenant_id, user_id) do nothing;
