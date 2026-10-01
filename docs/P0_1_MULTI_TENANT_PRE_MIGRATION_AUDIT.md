# P0.1 Multi-Tenant Architecture — Pre-Migration Audit

## Decision and baseline

- Backend base SHA: `c620320fee5753291f7444e73a190d25a1698cd2`
- Frontend base SHA: `a3f182080475a4efdeed136d3445d061ded94bf8`
- Audit date: 2026-10-01
- Migration status: **NOT STARTED**
- Production mutation: **NONE**

The current platform has no canonical tenant, membership, tenant-role, or tenant-settings tables. Consultant authorization is based on global user roles, active client assignments, and feature-specific consent. Nutrition contains isolated `organisation` terminology, but it is not a request-wide tenant authority. Therefore adding `tenant_id` directly to production resources before an expand/backfill/verify/contract sequence would put every sealed Consultant workflow at risk.

## Canonical model proposed for review

### Tenant

`id`, `name`, `slug`, `type`, `status`, `billing_owner_user_id`, `subscription_id`, `default_timezone`, `country`, `currency`, `created_at`, `updated_at`.

Allowed initial types: `ZESTIVA_INTERNAL`, `INDEPENDENT_CONSULTANT`, `PRACTICE`, `CLINIC`, `ENTERPRISE`.

### Tenant membership

`id`, `tenant_id`, `user_id`, `role`, `status`, `joined_at`, `invited_by`, `removed_at`, `created_at`, `updated_at` with unique `(tenant_id, user_id)`.

Tenant roles: `OWNER`, `CONSULTANT`, `SENIOR_CONSULTANT`, `COORDINATOR`, `BILLING_ADMIN`, `STAFF`, `CLIENT`. These are tenant roles and must not replace platform roles.

### Request authority

`authentication → active membership → server-resolved tenant → tenant role → domain permission → resource tenant → resource scope`.

Assignment and consent remain additional checks. Senior Diet Plan review remains `senior role + reviewable submitted version` and must not acquire a Consultant assignment requirement.

## Entity audit

| Entity/domain | Current table(s) | Primary key / ownership | Current tenant field | Current query scope | Risk | Change |
|---|---|---|---|---|---|---|
| Users | `users` | `id`; global identity | NONE | global ID/email/phone | HIGH | membership only; do not force one tenant on identity |
| Auth sessions/events | `auth_sessions`, `auth_events`, `role_audit_events` | user/session | NONE | user/session | MEDIUM | derive tenant after authentication; audit selected tenant |
| Clients | `fiteatsy_clients` | `id`, `account_user_id` | NONE | client/user ID | HIGH | tenant ownership required |
| Consultant assignments | `consultant_client_assignments`, `professional_assignment_audit_events` | assignment, consultant user, client user | NONE | product + active status + IDs | HIGH | tenant ownership and tenant-composite active uniqueness |
| Profiles | `health_profiles`, `nutrition_profiles`, `notification_preferences` | user/client | NONE | user/client ID | HIGH | tenant ownership or verified join through tenant client |
| Consultations/tasks | `consultant_client_operations`, `consultant_client_operation_audit` | client/consultant operation | NONE | assignment then IDs | HIGH | tenant ownership required |
| Goals/recovery | `recovery_programs`, `daily_checkins`, `nudges` | user/care case | NONE | user/care case | HIGH | tenant ownership required |
| Reports/documents | `health_reports`, `health_report_files`, `attachments`, `document_intelligence_audit`, upload sessions | user/client/report | NONE | account/report ID | HIGH | tenant ownership in DB, storage key, signed URL, preview/delete |
| Biomarkers/health | `biomarkers`, `biomarker_observations`, `health_observations`, aggregates/scores | user/client/report | NONE | account/client ID | HIGH | verified tenant join; prevent cross-tenant ID lookup |
| Diet plans | `diet_plans`, `diet_plan_versions`, `diet_plan_review_events`, option selections | care case/client/version | NONE | care case + assignment/review authority | HIGH | tenant ownership, composite version integrity |
| Nutrition authoring | food proposals, consultant meal templates/revisions/favourites | consultant/team | organisation only in selected library records | global consultant/team | HIGH | canonical tenant replaces scattered owner scope for private/team data |
| Notifications | `notifications`, `communications` | user | NONE | user ID | MEDIUM | tenant ownership for business notifications |
| Audit logs | numerous domain audit tables | actor/resource IDs | NONE | resource-specific | HIGH | canonical tenant audit envelope |
| Subscriptions/payments | plan tables, `user_subscriptions`, orders, transactions, events | user/payment | NONE | user/provider IDs | HIGH | distinguish tenant billing from mobile individual subscription |
| Files/profile photos | `profile_photo_assets` and report blobs | user/report | NONE | user/report ID | HIGH | tenant path/policy where tenant-owned; identity photo remains user-owned |
| Settings | preferences/profile JSON | user | NONE | user ID | MEDIUM | add tenant settings without replacing personal preferences |
| Global catalogues | food knowledge/catalogue/reference/release tables | system release/version | system/organisation owner labels in places | global/system | LOW | remain global unless explicitly tenant-curated |
| QA fixtures | QA fixture/handoff tables | QA identity | NONE | QA-only | MEDIUM | tenant fixtures required; never infer production tenant from QA data |

## Consultant API audit

| Routes | Current auth | Tenant scope | Repair required |
|---|---|---:|---:|
| `GET /v1/consultants/clients` | authenticated Consultant + active assignment projection | NO | YES |
| `/v1/consultants/clients/:clientId/workspace` and `/v1/clients/:clientId/workspace` | Consultant role + assignment; protected sections add consent | NO | YES |
| `/v1/consultants/clients/:clientId/operations*` | Consultant role + assignment | NO | YES |
| `/v1/professional-assignments/*` | authenticated privileged role | NO | YES |
| `/v1/consultants/clients/:clientId/diet-plans/*` | Consultant assignment and lifecycle guards | NO | YES |
| `/v1/consultants/diet-plan-reviews*` | Senior role + submitted-version authority | NO | YES, without assignment gate |
| `/v1/consultants/clients/:clientId/common-food*` | assignment + consent/nutrition authority | NO | YES |
| `/v1/consultants/meal-templates*` | Consultant identity/team | NO | YES |
| `/v1/consultants/food-proposals*` | role and proposal ownership | NO | YES |
| `/v1/reports/*` | authenticated account ownership | NO | YES for tenant-owned reports/files |
| `/v1/grievances/*` | authenticated user/admin role | NO | YES for tenant service queues |
| `/v1/subscriptions`, `/v1/payments` | user identity | NO | YES only when tenant billing is introduced |

No tenant identifier supplied in a JSON body or URL may be trusted directly. An optional tenant selection header may only select among active memberships and must be re-resolved server-side.

## Migration plan (expand → backfill → verify → contract)

| Order | Table/change | Current rows | Backfill rule | Default tenant | Null allowed | Rollback |
|---:|---|---|---|---|---|---|
| 1 | create `tenants` | 0 new | insert exactly one canonical Zestiva tenant | n/a | no | drop only if no memberships/resources reference it |
| 2 | create memberships/roles/settings | 0 new | map every active production user to Zestiva using existing role; client users become `CLIENT` | Zestiva | no | delete generated memberships then tables |
| 3 | add nullable `tenant_id` to clients/assignments | existing count measured in production preflight | derive via user membership; conflicting/missing rows quarantine and block | none implicit | YES during expand | drop indexes/columns while application still dual-reads |
| 4 | add nullable `tenant_id` to care cases, operations, tasks/goals | measured preflight | inherit from canonical client | none | YES during expand | same |
| 5 | add nullable `tenant_id` to reports/files/attachments | measured preflight | inherit user/client/report tenant and validate storage ownership | none | YES during expand | same |
| 6 | add nullable `tenant_id` to diet plans/versions/reviews | measured preflight | inherit care-case tenant; version/review must equal parent | none | YES during expand | same |
| 7 | add nullable `tenant_id` to tenant-owned nutrition/notifications/audit | measured preflight | inherit owner/client/resource tenant | none | YES during expand | same |
| 8 | dual-write + tenant-aware reads | n/a | server resolves membership; legacy predicates remain additional guards | n/a | YES | disable tenant enforcement feature flag, retain populated columns |
| 9 | verify | all affected rows | zero nulls, zero orphan/mismatch, sealed-flow regression | n/a | YES | fix data, do not contract |
| 10 | contract | all verified rows | add FKs, NOT NULL, tenant-aware composite uniqueness | n/a | NO | revert constraints first; data retained |

Production row counts must be captured immediately before migration with read-only `count(*)`, null, orphan, and cross-parent mismatch queries. No static source audit can truthfully supply production counts.

## Required constraints

- `(tenant_id, user_id)` membership uniqueness.
- Tenant-aware active assignment uniqueness.
- Parent/child tenant equality for report files, Diet Plan versions/reviews, operation audit, and attachments.
- Tenant-scoped slugs/team names/template names where uniqueness is tenant-local.
- Every tenant-owned audit event includes tenant, actor, role, resource type/id, action, timestamp.
- Storage object keys include non-guessable tenant ownership; signed URL creation revalidates tenant and resource access.

## Cross-tenant test matrix

Create isolated Tenant A and Tenant B fixtures, each with Owner, Consultant, Senior Consultant, Client, assignment, report, task, and submitted Diet Plan. Required denials cover roster/list, Client 360, report metadata/download/signed URL/delete, Diet Plan open/review/action, search/count inference, operations, and identifier enumeration. Use governed 404 for concealed resources and 403 only where the contract intentionally reveals existence.

## Frontend plan

Add only a tenant context provider that consumes a server-resolved current-tenant projection. Single-tenant users auto-select. API calls may send a selected membership identifier/header only after the server issued it; the backend remains authoritative. No tenant switcher or UI redesign is included in P0.1.

## Acceptance gates before any production migration

1. Migration dry-run on a production-schema clone with recorded counts.
2. Tenant A/B isolation tests pass for client, report/file, Diet Plan, search, and counts.
3. Complete sealed Zestiva lifecycle remains green.
4. Backend regression, frontend regression, builds, and `git diff --check` pass.
5. Exact-SHA L3, ENV-C, and frontend CI pass.
6. Controlled staging backfill reports zero unresolved rows.
7. Explicit approval is obtained before production migration/deployment.

## Current decision

`AUDIT_IN_PROGRESS`: the pre-migration architecture and risk model are complete, but source migration, CI, deployment, production acceptance, freeze, and seal are intentionally not started until the migration plan is reviewed and approved.
