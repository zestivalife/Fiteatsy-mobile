-- P0.1 canonical multi-tenant contract.
-- This migration is intentionally forward-only and fails closed if expand/backfill
-- evidence is incomplete. It does not infer tenant ownership.

do $$
declare
  table_name text;
  unresolved bigint;
begin
  foreach table_name in array array[
    'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
    'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
    'health_report_upload_sessions','document_intelligence_audit','biomarkers','biomarker_observations',
    'health_observations','diet_plans','diet_plan_versions','diet_plan_review_events','notifications',
    'profile_photo_assets','consultant_access_consents','consultant_access_consent_events'
  ] loop
    if to_regclass(table_name) is null then
      raise exception 'TENANT_CONTRACT_TABLE_MISSING: %', table_name;
    end if;
    execute format('select count(*) from %I where tenant_id is null', table_name) into unresolved;
    if unresolved <> 0 then
      raise exception 'TENANT_CONTRACT_UNRESOLVED_ROWS: table=% count=%', table_name, unresolved;
    end if;
  end loop;
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
    execute format('alter table %I alter column tenant_id set not null', table_name);
    execute format('drop trigger if exists tenant_dual_write on %I', table_name);
  end loop;
end $$;

drop function if exists set_zestiva_tenant_during_transition();

-- Tenant-relative assignment identity. User identifiers remain globally unique,
-- but the business constraint is explicitly scoped to the owning tenant.
drop index if exists consultant_client_assignments_active_unique;
create unique index if not exists consultant_client_assignments_active_tenant_unique
  on consultant_client_assignments(tenant_id, consultant_user_id, client_user_id, scope)
  where status='active';

-- Composite parent keys support database-enforced tenant equality.
create unique index if not exists fiteatsy_clients_id_tenant_unique
  on fiteatsy_clients(id,tenant_id);
create unique index if not exists fiteatsy_clients_user_tenant_unique
  on fiteatsy_clients(account_user_id,tenant_id);
create unique index if not exists health_reports_id_tenant_unique
  on health_reports(id,tenant_id);
create unique index if not exists diet_plans_id_tenant_unique
  on diet_plans(id,tenant_id);
create unique index if not exists diet_plan_versions_id_tenant_unique
  on diet_plan_versions(id,tenant_id);
create unique index if not exists biomarkers_id_tenant_unique
  on biomarkers(id,tenant_id);

alter table biomarkers drop constraint if exists biomarkers_canonical_name_key;
create unique index if not exists biomarkers_tenant_canonical_name_unique
  on biomarkers(tenant_id,canonical_name);

alter table consultant_client_assignments
  drop constraint if exists consultant_assignments_client_tenant_fk;
alter table consultant_client_assignments
  add constraint consultant_assignments_client_tenant_fk
  foreign key(client_user_id,tenant_id)
  references fiteatsy_clients(account_user_id,tenant_id) not valid;
alter table care_cases
  drop constraint if exists care_cases_client_tenant_fk;
alter table care_cases
  add constraint care_cases_client_tenant_fk
  foreign key(client_id,tenant_id)
  references fiteatsy_clients(id,tenant_id) not valid;
alter table health_report_files
  drop constraint if exists health_report_files_report_tenant_fk;
alter table health_report_files
  add constraint health_report_files_report_tenant_fk
  foreign key(report_id,tenant_id)
  references health_reports(id,tenant_id) not valid;
alter table diet_plan_versions
  drop constraint if exists diet_plan_versions_plan_tenant_fk;
alter table diet_plan_versions
  add constraint diet_plan_versions_plan_tenant_fk
  foreign key(diet_plan_id,tenant_id)
  references diet_plans(id,tenant_id) not valid;
alter table diet_plan_review_events
  drop constraint if exists diet_plan_reviews_plan_tenant_fk;
alter table diet_plan_review_events
  add constraint diet_plan_reviews_plan_tenant_fk
  foreign key(diet_plan_id,tenant_id)
  references diet_plans(id,tenant_id) not valid;
alter table diet_plan_review_events
  drop constraint if exists diet_plan_reviews_version_tenant_fk;
alter table diet_plan_review_events
  add constraint diet_plan_reviews_version_tenant_fk
  foreign key(diet_plan_version_id,tenant_id)
  references diet_plan_versions(id,tenant_id) not valid;
alter table biomarker_observations
  drop constraint if exists biomarker_observations_biomarker_tenant_fk;
alter table biomarker_observations
  add constraint biomarker_observations_biomarker_tenant_fk
  foreign key(biomarker_id,tenant_id)
  references biomarkers(id,tenant_id) not valid;

alter table consultant_client_assignments validate constraint consultant_assignments_client_tenant_fk;
alter table care_cases validate constraint care_cases_client_tenant_fk;
alter table health_report_files validate constraint health_report_files_report_tenant_fk;
alter table diet_plan_versions validate constraint diet_plan_versions_plan_tenant_fk;
alter table diet_plan_review_events validate constraint diet_plan_reviews_plan_tenant_fk;
alter table diet_plan_review_events validate constraint diet_plan_reviews_version_tenant_fk;
alter table biomarker_observations validate constraint biomarker_observations_biomarker_tenant_fk;

select refresh_tenant_backfill_verification();
