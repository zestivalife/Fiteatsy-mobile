-- P0.1 multi-tenant expand/backfill migration.
-- Additive only: existing authorization relationships remain authoritative during dual-read/write.

create table if not exists tenants (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  tenant_type text not null check (tenant_type in ('ZESTIVA_INTERNAL','INDEPENDENT_CONSULTANT','PRACTICE','CLINIC','ENTERPRISE')),
  status text not null default 'active' check (status in ('active','suspended','closed')),
  billing_owner_user_id text references users(id) on delete set null,
  subscription_id text,
  default_timezone text not null default 'Asia/Kolkata',
  country text not null default 'IN',
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_memberships (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  tenant_role text not null check (tenant_role in ('OWNER','CONSULTANT','SENIOR_CONSULTANT','COORDINATOR','BILLING_ADMIN','STAFF','CLIENT')),
  status text not null default 'active' check (status in ('active','invited','suspended','removed')),
  joined_at timestamptz not null default now(),
  invited_by text references users(id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists tenant_memberships_user_active_idx
  on tenant_memberships(user_id, status, tenant_id);

create table if not exists tenant_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_resolution_events (
  id bigserial primary key,
  tenant_id uuid references tenants(id) on delete set null,
  path text not null check (path in ('MEMBERSHIP','LEGACY_ZESTIVA_FALLBACK','DENIED','TENANT','LEGACY_FALLBACK')),
  route_family text not null,
  created_at timestamptz not null default now()
);

-- Re-running the additive migration upgrades the instrumentation vocabulary
-- without invalidating evidence captured by an earlier expand-phase run.
alter table tenant_resolution_events drop constraint if exists tenant_resolution_events_path_check;
alter table tenant_resolution_events add constraint tenant_resolution_events_path_check
  check (path in ('MEMBERSHIP','LEGACY_ZESTIVA_FALLBACK','DENIED','TENANT','LEGACY_FALLBACK'));

insert into tenants(id,name,slug,tenant_type,status,default_timezone,country,currency)
values ('00000000-0000-4000-8000-000000000001','Zestiva','zestiva','ZESTIVA_INTERNAL','active','Asia/Kolkata','IN','INR')
on conflict (id) do update set
  name=excluded.name, slug=excluded.slug, tenant_type=excluded.tenant_type,
  default_timezone=excluded.default_timezone, country=excluded.country,
  currency=excluded.currency, updated_at=now();

insert into tenant_settings(tenant_id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (tenant_id) do nothing;

insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status)
select md5('zestiva-membership:' || u.id)::uuid,
       '00000000-0000-4000-8000-000000000001', u.id,
       case lower(coalesce(u.role,''))
         when 'platform_owner' then 'OWNER'
         when 'super_admin' then 'OWNER'
         when 'admin' then 'STAFF'
         when 'senior_consultant' then 'SENIOR_CONSULTANT'
         when 'consultant' then 'CONSULTANT'
         when 'provider' then 'CONSULTANT'
         when 'dietician' then 'CONSULTANT'
         when 'coordinator' then 'COORDINATOR'
         else 'CLIENT'
       end,
       case when u.status='active' and u.deleted_at is null then 'active' else 'suspended' end
from users u
on conflict (tenant_id,user_id) do update set
  tenant_role=excluded.tenant_role, status=excluded.status, updated_at=now();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
    'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
    'health_report_upload_sessions',
    'document_intelligence_audit','biomarkers','biomarker_observations','health_observations',
    'diet_plans','diet_plan_versions','diet_plan_review_events','notifications','profile_photo_assets',
    'consultant_access_consents','consultant_access_consent_events'
  ] loop
    if to_regclass(table_name) is not null then
      execute format('alter table %I add column if not exists tenant_id uuid references tenants(id) on delete restrict',table_name);
      execute format('update %I set tenant_id=$1 where tenant_id is null',table_name)
        using '00000000-0000-4000-8000-000000000001'::uuid;
      execute format('create index if not exists %I on %I(tenant_id)',table_name || '_tenant_idx',table_name);
    end if;
  end loop;
end $$;

create or replace function set_zestiva_tenant_during_transition()
returns trigger language plpgsql as $$
begin
  -- Expand phase remains nullable. If an isolated test/recovery reset has
  -- intentionally removed the seed tenant, preserve the legacy write rather
  -- than manufacturing tenant state or violating the foreign key.
  if new.tenant_id is null and exists (
    select 1 from tenants where id='00000000-0000-4000-8000-000000000001'::uuid
  ) then
    new.tenant_id := '00000000-0000-4000-8000-000000000001'::uuid;
  end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
    'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
    'health_report_upload_sessions','document_intelligence_audit','biomarkers','biomarker_observations',
    'health_observations','diet_plans','diet_plan_versions','diet_plan_review_events','notifications',
    'profile_photo_assets','consultant_access_consents','consultant_access_consent_events'
  ] loop
    if to_regclass(table_name) is not null then
      execute format('drop trigger if exists %I on %I','tenant_dual_write',table_name);
      execute format('create trigger tenant_dual_write before insert on %I for each row execute function set_zestiva_tenant_during_transition()',table_name);
    end if;
  end loop;
end $$;

create table if not exists tenant_backfill_verification_snapshot (
  table_name text primary key,
  total_rows bigint not null,
  unresolved_rows bigint not null,
  distinct_tenants bigint not null,
  zestiva_backfilled_rows bigint not null,
  captured_at timestamptz not null default now()
);

create or replace function refresh_tenant_backfill_verification()
returns void language plpgsql as $$
declare table_name text;
begin
  foreach table_name in array array[
    'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
    'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
    'health_report_upload_sessions','document_intelligence_audit','biomarkers','biomarker_observations',
    'health_observations','diet_plans','diet_plan_versions','diet_plan_review_events','notifications',
    'profile_photo_assets','consultant_access_consents','consultant_access_consent_events'
  ] loop
    if to_regclass(table_name) is not null then
      execute format(
        'insert into tenant_backfill_verification_snapshot(table_name,total_rows,unresolved_rows,distinct_tenants,zestiva_backfilled_rows,captured_at)
         select %L,count(*),count(*) filter(where tenant_id is null),count(distinct tenant_id),
                count(*) filter(where tenant_id=%L::uuid),now() from %I
         on conflict(table_name) do update set total_rows=excluded.total_rows,
           unresolved_rows=excluded.unresolved_rows,distinct_tenants=excluded.distinct_tenants,
           zestiva_backfilled_rows=excluded.zestiva_backfilled_rows,captured_at=excluded.captured_at',
        table_name,'00000000-0000-4000-8000-000000000001',table_name
      );
    end if;
  end loop;
end $$;

select refresh_tenant_backfill_verification();

create or replace view tenant_backfill_verification as
select table_name,total_rows,(total_rows-unresolved_rows) as backfilled_rows,unresolved_rows,
       distinct_tenants,zestiva_backfilled_rows,captured_at
from tenant_backfill_verification_snapshot;

create or replace view tenant_relationship_verification as
select 'client_assignment'::text as relationship,
       count(*) filter(where child.tenant_id is distinct from parent.tenant_id)::bigint as mismatch_count
from consultant_client_assignments child
join fiteatsy_clients parent on parent.account_user_id=child.client_user_id
union all
select 'report_file',count(*) filter(where child.tenant_id is distinct from parent.tenant_id)
from health_report_files child join health_reports parent on parent.id=child.report_id
union all
select 'diet_plan_version',count(*) filter(where child.tenant_id is distinct from parent.tenant_id)
from diet_plan_versions child join diet_plans parent on parent.id=child.diet_plan_id
union all
select 'diet_plan_review',count(*) filter(where child.tenant_id is distinct from parent.tenant_id)
from diet_plan_review_events child join diet_plans parent on parent.id=child.diet_plan_id;

comment on view tenant_backfill_verification is
  'Read-only P0.1 expand/backfill evidence for all 21 tenant-owned tables. Contract migration is prohibited while unresolved_rows is non-zero.';

comment on view tenant_relationship_verification is
  'Read-only parent/child tenant mismatch evidence. Every mismatch count must be zero before contract.';
