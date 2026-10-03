import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');

test('expand migration creates deterministic Zestiva tenant and additive nullable ownership',()=>{
  const migration=read('backend/src/db/migrations/0082_multi_tenant_expand_backfill.sql');
  assert.match(migration,/create table if not exists tenants/);
  assert.match(migration,/create table if not exists tenant_memberships/);
  assert.match(migration,/create table if not exists tenant_settings/);
  assert.match(migration,/00000000-0000-4000-8000-000000000001/);
  assert.match(migration,/add column if not exists tenant_id uuid/);
  assert.doesNotMatch(migration,/alter column tenant_id set not null/i);
  assert.match(migration,/tenant_backfill_verification/);
  assert.match(migration,/if new\.tenant_id is null and exists/);
});

test('destructive API-test reset restores the canonical tenant after PostgreSQL cascade',()=>{
  const reset=read('backend/src/test-support/reset.ts');
  const foundation=read('backend/src/test-support/test-tenants.ts');
  const truncate=reset.indexOf("truncate table auth_sessions, fiteatsy_clients, users restart identity cascade");
  const restore=reset.indexOf('await ensureCanonicalTestTenants()');
  const invariant=reset.indexOf('await assertCanonicalTestTenantInvariant()');
  assert.ok(truncate>=0,'the governed destructive reset must remain explicit');
  assert.ok(restore>truncate,'the canonical tenant must be restored after the user cascade');
  assert.ok(invariant>restore,'reset must validate the canonical tenant immediately after reseeding');
  assert.match(foundation,/insert into tenants\(id,name,slug,tenant_type,status,default_timezone,country,currency\)/);
  assert.match(foundation,/insert into tenant_settings\(tenant_id\)/);
  assert.match(foundation,/ZESTIVA_INTERNAL_TENANT_ID = '00000000-0000-4000-8000-000000000001'/);
  assert.match(foundation,/TENANT_A_ID = '00000000-0000-4000-8000-00000000000a'/);
  assert.match(foundation,/TENANT_B_ID = '00000000-0000-4000-8000-00000000000b'/);
  assert.doesNotMatch(foundation,/insert into tenant_memberships/);
});

test('authenticated API helper fails fast with route and method diagnostics',()=>{
  const helper=read('tests/helpers/http.ts');
  assert.match(helper,/TEST_REQUEST_TIMEOUT_MS = 15_000/);
  assert.match(helper,/Authenticated test request failed: \$\{method\} \$\{path\}/);
  assert.match(helper,/clearTimeout\(timeout\)/);
  assert.doesNotMatch(helper,/authorization.*console/i);
});

test('all 21 tenant-owned tables receive additive ownership, dual-write, and verification coverage',()=>{
  const migration=read('backend/src/db/migrations/0082_multi_tenant_expand_backfill.sql');
  const tables=[
    'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
    'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
    'health_report_upload_sessions','document_intelligence_audit','biomarkers','biomarker_observations',
    'health_observations','diet_plans','diet_plan_versions','diet_plan_review_events','notifications',
    'profile_photo_assets','consultant_access_consents','consultant_access_consent_events'
  ];
  for(const table of tables){
    const occurrences=migration.match(new RegExp(`'${table}'`,'g'))?.length??0;
    assert.ok(occurrences>=3,`${table} must be covered by expand/backfill, dual-write, and verification`);
  }
  assert.match(migration,/tenant_relationship_verification/);
  assert.match(migration,/mismatch_count/);
});

test('governed migrations create every authoritative tenant table and fail closed on drift',()=>{
  const migration=read('backend/src/db/migrations/0083_create_daily_checkins_and_nudges.sql');
  assert.match(migration,/create table if not exists daily_checkins/);
  assert.match(migration,/create table if not exists nudges/);
  assert.match(migration,/add column if not exists tenant_id uuid references tenants\(id\) on delete restrict/);
  assert.match(migration,/authoritative tenant table missing after governed migrations/);
  assert.match(migration,/verified_count <> 21/);
  assert.doesNotMatch(migration,/tenant_id set not null/i);
  assert.doesNotMatch(migration,/drop table/i);
});

test('tenant request projection resolves only active server-side membership',()=>{
  const source=read('backend/src/modules/tenancy/tenant-context.ts');
  assert.match(source,/membership\.user_id=\$1/);
  assert.match(source,/membership\.status='active'/);
  assert.match(source,/tenant\.status='active'/);
  assert.doesNotMatch(source,/req\.(body|query).*tenant/i);
  assert.match(source,/TENANT_MIGRATION_MODE/);
  assert.match(source,/recordTenantResolutionPath\(null,'DENIED'/);
});

test('contract authority resolves membership only and fails closed in every migration mode',async()=>{
  const {resolveTenantResolutionDecision}=await import('../../backend/src/modules/tenancy/tenant-context.ts');
  const membership={
    tenantId:'tenant-a',tenantName:'A',tenantType:'PRACTICE' as const,
    currentMembershipRole:'CONSULTANT' as const,resolutionPath:'MEMBERSHIP' as const,
  };
  assert.equal(resolveTenantResolutionDecision({activeMembership:membership,hasAnyMembership:true,legacyZestivaEligible:true,migrationMode:'EXPAND'}),'MEMBERSHIP');
  assert.equal(resolveTenantResolutionDecision({activeMembership:null,hasAnyMembership:false,legacyZestivaEligible:true,migrationMode:'EXPAND'}),'DENIED');
  assert.equal(resolveTenantResolutionDecision({activeMembership:null,hasAnyMembership:false,legacyZestivaEligible:true,migrationMode:'BACKFILL'}),'DENIED');
  assert.equal(resolveTenantResolutionDecision({activeMembership:null,hasAnyMembership:false,legacyZestivaEligible:true,migrationMode:'DUAL_READ'}),'DENIED');
  assert.equal(resolveTenantResolutionDecision({activeMembership:null,hasAnyMembership:true,legacyZestivaEligible:true,migrationMode:'EXPAND'}),'DENIED');
  assert.equal(resolveTenantResolutionDecision({activeMembership:null,hasAnyMembership:false,legacyZestivaEligible:true,migrationMode:'CANONICAL'}),'DENIED');
});

test('resource scope requires exact tenant equality and never accepts unowned legacy rows',async()=>{
  const {assertTenantResourceScope}=await import('../../backend/src/modules/tenancy/tenant-context.ts');
  const context={tenantId:'tenant-a',tenantName:'A',tenantType:'PRACTICE' as const,currentMembershipRole:'CONSULTANT' as const,resolutionPath:'MEMBERSHIP' as const};
  assert.equal(assertTenantResourceScope(context,'tenant-a',false),true);
  assert.equal(assertTenantResourceScope(context,'tenant-b',true),false);
  assert.equal(assertTenantResourceScope(context,null,false),false);
  assert.equal(assertTenantResourceScope(context,null,true),false);
});

test('sealed assignment and Senior review authorities are not replaced',()=>{
  const server=read('backend/src/server.ts');
  const senior=read('backend/src/modules/nutrition/nutrition.service.ts');
  assert.match(server,/requireConsultantClientAssignment/);
  assert.match(senior,/allowSeniorAuthority/);
});

test('migrated Consultant access requires assignment, matching resource tenant, and both memberships',()=>{
  const repository=read('backend/src/modules/consultant-access/consultant-access.repository.ts');
  assert.match(repository,/assignment\.tenant_id = client\.tenant_id/);
  assert.match(repository,/consultant_membership\.tenant_id = assignment\.tenant_id/);
  assert.match(repository,/consultant_membership\.user_id = assignment\.consultant_user_id/);
  assert.match(repository,/client_membership\.user_id = assignment\.client_user_id/);
  assert.doesNotMatch(repository,/assignment\.tenant_id is null/);
});

test('report, file, upload, roster, search and count paths require canonical tenant equality',()=>{
  const reports=read('backend/src/modules/reports/reports.store.ts');
  const consultants=read('backend/src/modules/consultants/consultants.repository.ts');
  assert.match(reports,/health_report_upload_sessions[\s\S]*tenant_id/);
  assert.match(reports,/health_report_files[\s\S]*tenant_id/);
  assert.match(reports,/and tenant_id = \$3/);
  assert.doesNotMatch(reports,/tenant_id = \$3 or tenant_id is null/);
  assert.match(reports,/recordTenantResolutionPath/);
  assert.match(consultants,/assignment\.tenant_id = \$5/);
  assert.match(consultants,/c\.tenant_id = \$5/);
  assert.doesNotMatch(consultants,/tenant_id is null/);
  assert.match(consultants,/consultant_client_roster/);
});

test('contract migration closes ownership, uniqueness and relational tenant boundaries',()=>{
  const migration=read('backend/src/db/migrations/0084_multi_tenant_contract.sql');
  const tables=[
    'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
    'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
    'health_report_upload_sessions','document_intelligence_audit','biomarkers','biomarker_observations',
    'health_observations','diet_plans','diet_plan_versions','diet_plan_review_events','notifications',
    'profile_photo_assets','consultant_access_consents','consultant_access_consent_events'
  ];
  for(const table of tables) assert.match(migration,new RegExp(`'${table}'`));
  assert.match(migration,/alter table %I alter column tenant_id set not null/);
  assert.match(migration,/consultant_client_assignments_active_tenant_unique/);
  assert.match(migration,/foreign key\(client_user_id,tenant_id\)/);
  assert.match(migration,/foreign key\(diet_plan_version_id,tenant_id\)/);
  assert.match(migration,/drop trigger if exists tenant_dual_write/);
});

test('platform-global authority is explicit and cannot manufacture tenant membership',()=>{
  const authority=read('backend/src/modules/tenancy/platform-authority.ts');
  assert.match(authority,/PLATFORM_GLOBAL_ROLES/);
  assert.match(authority,/PLATFORM_AUTHORITY_REQUIRED/);
  assert.match(authority,/never manufactures membership/);
  assert.doesNotMatch(authority,/insert into tenant_memberships/i);
});

test('new mobile, dashboard and governed QA identities receive explicit canonical membership before tenant writes',()=>{
  const tenancy=read('backend/src/modules/tenancy/tenant-context.ts');
  const auth=read('backend/src/modules/auth/auth.repository.ts');
  const qa=read('backend/src/modules/admin/qa-provisioning.repository.ts');
  assert.match(tenancy,/ensureCanonicalZestivaMembership/);
  assert.match(tenancy,/on conflict\(tenant_id,user_id\) do update/);
  assert.match(auth,/ensureCanonicalZestivaMembership\(user\.id, 'CLIENT', client\)/);
  assert.match(auth,/input\.bridgeRole === 'senior_consultant' \? 'SENIOR_CONSULTANT' : 'CONSULTANT'/);
  assert.match(qa,/input\.role === 'admin'[\s\S]*\? 'STAFF'/);
  assert.ok(
    auth.indexOf("ensureCanonicalZestivaMembership(user.id, 'CLIENT', client)")
      < auth.indexOf('createOrResolveClientForAccount(user.id, client)'),
    'canonical membership must precede the first tenant-owned mobile client write',
  );
});

test('Senior review queue scopes plans, versions and review events to the active tenant',()=>{
  const store=read('backend/src/modules/nutrition/nutrition.store.ts');
  const service=read('backend/src/modules/nutrition/nutrition.service.ts');
  assert.match(store,/dp\.tenant_id = \$2::uuid and dpv\.tenant_id = \$2::uuid/);
  assert.match(store,/events\.tenant_id = \$2::uuid/);
  assert.match(service,/resolveActiveTenantContextForUserId\(account\.accountId\)/);
  assert.match(service,/nutrition\.senior-review-queue/);
  assert.match(service,/allowSeniorAuthority/);
});

test('external tenant writes use explicit trusted authority instead of the Zestiva trigger',()=>{
  const authority=read('backend/src/modules/tenancy/tenant-write-authority.ts');
  const clients=read('backend/src/modules/client/client.repository.ts');
  const platform=read('backend/src/modules/platform/platform.store.ts');
  const assignments=read('backend/src/modules/professional-assignments/professional-assignments.repository.ts');
  const qaAssignments=read('backend/src/modules/admin/qa-provisioning.repository.ts');
  const client360=read('backend/src/modules/consultants/client360.repository.ts');
  const health=read('backend/src/modules/health/health-observations.repository.ts');
  const biomarkers=read('backend/src/modules/biomarkers/biomarkers.repository.ts');
  const nutrition=read('backend/src/modules/nutrition/nutrition.store.ts');
  const notifications=read('backend/src/modules/platform/platform.store.ts');
  const photos=read('backend/src/modules/grievances/grievances.repository.ts');
  const consent=read('backend/src/modules/consultant-access/consultant-access.repository.ts');
  assert.match(authority,/TENANT_RESOURCE_MISMATCH/);
  for(const source of [clients,platform,assignments,qaAssignments,client360,health,biomarkers,nutrition,notifications,photos,consent]){
    assert.match(source,/tenant_id/);
  }
  assert.match(nutrition,/resolveTrustedTenantForCareCaseWrite/);
  assert.match(consent,/relationship\.tenant_id/);
});
