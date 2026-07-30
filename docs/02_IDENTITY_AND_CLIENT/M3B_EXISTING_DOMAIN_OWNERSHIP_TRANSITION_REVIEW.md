# M3B — Existing Domain Ownership Transition Review

**Status:** `ARCHITECTURE APPROVED; M3B.1 IMPLEMENTED`
**Date:** `30 July 2026`  
**Applies To:** `M3B — Existing Domain Ownership Transition`  
**Implementation Authorization:** `M3B.1 ONLY`

## 1. Authoritative Baseline

- `M3A — Client Identity Foundation` is `PRODUCTION_ACCEPTED`.
- Production runtime commit: `141f405d38e8f93b663c84288f76ba59348f4a09`.
- Governance close-out baseline commit: `29959dcb8e6433ce65007e9527afc577e96de4ef`.
- Branch: `main`.
- Production deployment: `a0db3b89`.
- Production environment: `production`.
- Production evidence confirms `users = 0` and `fiteatsy_clients = 0`.
- Production evidence confirms migration `0002_m3a_client_identity_foundation.sql` is recorded/applied.

M3A established:

- `1 Account : 1 Fiteatsy Client` for M3.
- durable `fiteatsy_clients` aggregate.
- immutable public `fiteatsy_client_id`.
- server-side current-client resolution.
- separate Account vs Client responsibility boundary.
- CAP-001 correlation remains separate.
- M3B and M3C were intentionally excluded from M3A.

## 2. Review Objective

Define the correct long-term ownership transition from account-oriented `user_id` domain ownership to client-oriented ownership without:

- breaking auth/session behavior;
- leaking internal identifiers;
- introducing IDOR;
- creating ambiguous dual ownership;
- blocking CAP-001 correlation;
- blocking future CAP-003 professional access;
- creating irreversible migration risk.

## 2A. Locked Product Owner Decisions

Applied on `30 July 2026`:

- ownership cutover is approved now rather than deferred until after production data accumulates;
- canonical internal direct ownership remains `client_id -> fiteatsy_clients.id`;
- temporary compatibility is allowed only where technically necessary and is not the target architecture;
- deactivated/suspended Clients retain historical domain data;
- destructive cascading deletion from Client into longitudinal health-domain records is not approved;
- migration failure policy is fail-closed;
- CAP-001 remains a separate correlation boundary and not an ownership or authorization substitute;
- CAP-003 professional access remains out of scope;
- family/dependants remain out of scope for M3.

## 3. Current Ownership Architecture

Current request resolution path:

```text
Bearer Session
  -> auth_sessions.user_id
  -> users.id (Account)
  -> resolveCurrentClientForAccount(users.id)
  -> fiteatsy_clients row
```

Current domain persistence still primarily uses `user_id -> users.id` for ownership.

Observed repository facts:

- `auth_sessions.user_id` is a security/account reference and should remain account-owned.
- `fiteatsy_clients.account_user_id` is the authoritative `1:1` account-to-client link and should remain account-owned.
- `platform.routes.ts`, `platform.service.ts`, `reports.routes.ts`, and `wearables.routes.ts` still operate in an account-keyed request model.
- `platform.store.ts` persists the main health-domain aggregates by `user_id`.
- `reports.store.ts` and `wearables.service.ts` are still in-memory and account-keyed today.
- several child tables already have a more natural parent-owned path than a direct owner FK.

## 4. Ownership Inventory

| Domain / Table | Current Owner Field | Current Owner Entity | Desired Owner Entity | Requires Migration? | Authorization Impact | API Impact | Compatibility Requirement | Risk Level | M3B In Scope? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `auth_sessions` | `user_id` | Account | Account | No | None if unchanged | None | None | Low | No | Security/session identity, not client-domain ownership. |
| `fiteatsy_clients` | `account_user_id` | Account link | Account link | No | None if unchanged | None | None | Low | No | Private client aggregate root created in M3A. |
| `health_profiles` | `user_id` | Account | Client | Yes | High | Medium | Short transition only | High | Yes | Primary longitudinal health root. |
| `recovery_programs` | `health_profile_id` | Parent aggregate | Parent aggregate | Maybe | Medium | Low | None if parent path retained | Medium | Yes | Should stay parent-derived, not gain redundant direct client FK. |
| `care_cases` | `user_id` and `health_profile_id` | Account + parent | Client + parent | Yes | High | Medium | Short transition only | High | Yes | Canonical case aggregate should resolve through Client. |
| `nutrition_profiles` | `user_id` and `health_profile_id` | Account + parent | Client + parent | Yes | High | Medium | Short transition only | High | Yes | Root nutrition state should align to client ownership. |
| `timeline_events` | `user_id` and `care_case_id` | Account + parent | Parent-derived via care case | Yes | High | Low | None after parent ownership cutover | Medium | Yes | Direct owner field appears redundant. |
| `health_events` | `user_id` and `care_case_id` | Account + parent | Parent-derived via care case | Yes | High | Low | None after parent ownership cutover | Medium | Yes | Should inherit ownership from care case. |
| `health_tickets` | `user_id`, `care_case_id`, `owner_id` | Account + parent + assignee | Parent-derived via care case | Yes | High | Low | None after parent ownership cutover | High | Yes | `owner_id` is assignee, not domain owner. |
| `notifications` | `user_id`, optional `care_case_id` | Account | Client | Yes | Medium | Low | Short transition only | Medium | Yes | Some notifications are care-case-adjacent, some are client-wide. |
| `lab_reports` | `user_id`, optional `care_case_id` | Account | Client | Yes | Medium | Medium | Short transition only | Medium | Yes | Persisted schema exists even though active runtime module is still limited. |
| `biomarkers` | `user_id`, optional `report_id`, optional `care_case_id` | Account + parent candidates | Parent-derived; client fallback only if needed | Yes | Medium | Low | None after parent cutover | Medium | Yes | Prefer derivation from report/case instead of redundant client FK when possible. |
| `diet_plans` | `user_id`, `care_case_id` | Account + parent | Parent-derived via care case | Yes | Medium | Low | None after parent cutover | Medium | Yes | Direct owner field appears redundant. |
| `diet_plan_versions` | `diet_plan_id`, `generated_by` | Parent + actor | Parent-derived | No direct owner migration | Low | None | None | Low | Yes | `generated_by` is actor/audit, not client owner. |
| `clinical_memory` | `user_id`, `care_case_id` | Account + parent | Parent-derived via care case | Yes | Medium | Low | None after parent cutover | Medium | Yes | Should inherit from care case. |
| `communications` | `user_id`, `care_case_id` | Account + parent | Parent-derived via care case | Yes | Medium | Low | None after parent cutover | Medium | Yes | Keep communication actor metadata separate from ownership. |
| `attachments` | `user_id`, optional `care_case_id` | Account | Client or parent-derived | Yes | Medium | Low | Short transition only | Medium | Yes | Final owner path depends on attachment parent contract. |
| `daily_checkins` | `user_id` | Account | Client | Yes | Medium | Low | None if migrated early | Low | Yes | Persisted table exists; route ownership currently not active. |
| `ai_decision_logs` | `user_id` | Account | Client | Yes | Medium | Low | None if migrated early | Low | Yes | Longitudinal AI audit should follow client-owned health context. |
| `nudges` | `user_id` | Account | Client | Yes | Medium | Low | None if migrated early | Low | Yes | Scheduled health-domain nudges should follow client ownership. |
| `family_connections` | `owner_user_id`, `connected_user_id` | Account/social | Account/social | No in M3B | Medium | None | Existing account model retained | Medium | No | Family/caregiver semantics are future explicit capability work. |
| `family_visibility_settings` | `owner_user_id`, `viewer_user_id` | Account/social | Account/social | No in M3B | Medium | None | Existing account model retained | Medium | No | Access-sharing capability, not core client-domain ownership. |
| `family_support_events` | `owner_user_id`, `viewer_user_id` | Account/social | Account/social | No in M3B | Medium | None | Existing account model retained | Medium | No | Future governed family scope. |
| `reports.store.ts` runtime store | `userId` | Account | Client-aware contract later | Not in DB yet | Medium | Medium | Temporary account compatibility acceptable | Medium | Partial | Active runtime is in-memory; contract should align during/after M3B. |
| `wearables.service.ts` runtime store | `userId` | Account | Client-aware contract later | Not in DB yet | Medium | Medium | Temporary account compatibility acceptable | Medium | Partial | No persisted DB ownership surface today. |

## 5. Option Review

### Option A — Replace domain `user_id` FK with `client_id` FK

Benefits:

- clean long-term domain boundary;
- lowest future authorization ambiguity;
- keeps account security separate from domain ownership;
- best fit for future professional access and CAP-001 correlation.

Risks:

- requires coordinated schema/repository/API cutover;
- careless migration could break protected baseline routes.

Migration complexity:

- moderate, but materially reduced because production currently has zero users/clients.

Authorization consequences:

- strong; ordinary user access becomes Account -> Current Client -> Owned Resource.

CAP-001 / CAP-003 consequences:

- best future fit because both can reference Client without overloading Account.

Rollback:

- manageable if first implementation is additive-first and non-destructive.

### Option B — Keep `user_id` and add `client_id` during a compatibility period

Benefits:

- can stage code changes gradually.

Risks:

- dual ownership ambiguity;
- more IDOR edge cases;
- higher chance temporary compatibility becomes permanent debt.

Migration complexity:

- highest overall because both models must stay coherent.

Authorization consequences:

- mixed reads/writes are harder to reason about and test.

CAP-001 / CAP-003 consequences:

- future access models stay blurred longer than necessary.

Rollback:

- superficially easier, but operational complexity is higher.

### Option C — Keep permanent account ownership and resolve Client indirectly

Benefits:

- smallest immediate code change.

Risks:

- fails the long-term ownership objective;
- keeps domain identity tied to authentication identity;
- weak foundation for professional access and cross-system correlation.

Migration complexity:

- low now, high later.

Authorization consequences:

- keeps user/account and client semantics permanently ambiguous.

CAP-001 / CAP-003 consequences:

- poor fit; future features would inherit the wrong boundary.

Rollback:

- simple, but at the cost of architectural correctness.

### Recommended Option

Recommend **Option A** with an additive-first implementation sequence and only a **brief internal compatibility phase**, not a long-lived dual-write model.

## 6. Recommended Cutover Strategy

### Recommendation

Use a **direct cutover now** while production data is empty.

Implementation shape for later approval:

1. add canonical client-owned or parent-derived schema paths;
2. backfill/verify in the same governed implementation slice;
3. switch repositories and authorization to client ownership;
4. remove obsolete account-ownership columns after verification, not as a permanent compatibility mode.

### Why this is safest

- production currently has `0` users and `0` clients, so there is no live longitudinal dataset to remap;
- it avoids carrying a confusing mixed-ownership contract into M3C;
- it minimizes future migration cost before real production data arrives;
- it keeps the protected auth/session baseline intact by leaving account/security tables alone;
- it reduces the chance of IDOR introduced by long-lived account/client coexistence.

## 7. Target Ownership Architecture

Canonical target path:

```text
Bearer Session
  -> Account
  -> Current Fiteatsy Client
  -> Client-owned aggregate root
  -> Parent-derived child resource where applicable
```

Rules:

- Account remains the authority for credentials, OTP, sessions, and security recovery.
- Client becomes the canonical owner for longitudinal Fiteatsy health-domain state.
- Parent-derived child resources should not gain redundant direct client ownership where the parent path is already authoritative.
- Assignee, actor, practitioner, consultant, mentor, and generated-by fields remain relationship/audit fields, not domain owner fields.

## 8. Database Design

### Canonical Internal FK

Use:

`client_id -> fiteatsy_clients.id`

as the canonical internal ownership FK where a direct client owner is required.

Public APIs should continue to expose only:

`fiteatsy_client_id`

when a client identifier must be exposed externally.

### Proposed Table Design

| Table | Current FK | Proposed FK / Ownership | Nullability | FK Target | ON DELETE | Index / Constraint Guidance | Backfill / Compatibility |
|---|---|---|---|---|---|---|---|
| `health_profiles` | `user_id -> users.id` | `client_id -> fiteatsy_clients.id` | `NOT NULL` | `fiteatsy_clients.id` | Product Owner review required | unique active profile per client if business rule remains `1:1` | add `client_id`, backfill, switch, then remove `user_id` |
| `care_cases` | `user_id -> users.id` plus `health_profile_id` | `client_id -> fiteatsy_clients.id` plus `health_profile_id` | `NOT NULL` | `fiteatsy_clients.id` | Product Owner review required | index `(client_id, status)` and `(health_profile_id)` | add `client_id`, backfill from profile/account mapping |
| `nutrition_profiles` | `user_id -> users.id` plus `health_profile_id` | `client_id -> fiteatsy_clients.id` plus `health_profile_id` | `NOT NULL` | `fiteatsy_clients.id` | Product Owner review required | unique active nutrition profile per client if intended | add `client_id`, backfill, then remove `user_id` |
| `notifications` | `user_id -> users.id` | `client_id -> fiteatsy_clients.id` | `NOT NULL` for client-wide notifications | `fiteatsy_clients.id` | Product Owner review required | index `(client_id, created_at desc)` | backfill from account-client mapping |
| `lab_reports` | `user_id -> users.id` | `client_id -> fiteatsy_clients.id`, retain optional `care_case_id` | `NOT NULL` if client-owned root | `fiteatsy_clients.id` | Product Owner review required | index by `client_id`, `care_case_id`, `report_date` | backfill from account-client mapping |
| `attachments` | `user_id -> users.id` | `client_id` or parent-derived by `parent_kind` / `care_case_id` | Mixed; requires design choice | `fiteatsy_clients.id` if direct | Product Owner review required | parent-scope indexes required | defer exact shape to M3B implementation design |
| `daily_checkins` | `user_id -> users.id` | `client_id -> fiteatsy_clients.id` | `NOT NULL` | `fiteatsy_clients.id` | Product Owner review required | preserve uniqueness by `(client_id, checkin_date)` | straightforward backfill |
| `ai_decision_logs` | `user_id -> users.id` | `client_id -> fiteatsy_clients.id` | `NOT NULL` | `fiteatsy_clients.id` | Product Owner review required | index by `client_id, created_at` | straightforward backfill |
| `nudges` | `user_id -> users.id` | `client_id -> fiteatsy_clients.id` | `NOT NULL` | `fiteatsy_clients.id` | Product Owner review required | index by `client_id, scheduled_at` | straightforward backfill |
| `timeline_events` | `user_id -> users.id` and `care_case_id` | parent-derived via `care_case_id` | N/A | N/A | parent governs | index by `care_case_id, event_time` | remove redundant `user_id` after case cutover |
| `health_events` | `user_id -> users.id` and `care_case_id` | parent-derived via `care_case_id` | N/A | N/A | parent governs | index by `care_case_id, event_time` | remove redundant `user_id` after case cutover |
| `health_tickets` | `user_id -> users.id` and `care_case_id` | parent-derived via `care_case_id`; keep `owner_id` as assignee | N/A | N/A | parent governs | index by `care_case_id, ticket_status` | remove redundant `user_id` after case cutover |
| `diet_plans` | `user_id -> users.id` and `care_case_id` | parent-derived via `care_case_id` | N/A | N/A | parent governs | index by `care_case_id, plan_status` | remove redundant `user_id` after case cutover |
| `diet_plan_versions` | `diet_plan_id` | parent-derived via `diet_plan_id` | N/A | N/A | parent governs | version uniqueness/index unchanged | no direct ownership change |
| `clinical_memory` | `user_id -> users.id` and `care_case_id` | parent-derived via `care_case_id` | N/A | N/A | parent governs | index by `care_case_id, memory_kind` | remove redundant `user_id` after case cutover |
| `communications` | `user_id -> users.id` and `care_case_id` | parent-derived via `care_case_id` | N/A | N/A | parent governs | index by `care_case_id, created_at` | remove redundant `user_id` after case cutover |
| `biomarkers` | `user_id -> users.id`, optional `report_id`, optional `care_case_id` | parent-derived via `report_id` or `care_case_id`; only add `client_id` if parent path is insufficient | N/A | N/A | parent governs | indexes on parent FK paths | implementation should decide after concrete usage audit |

Deletion behavior:

- do **not** silently hard-code destructive cascade semantics for client-owned health data;
- `ON DELETE` treatment for client-owned records requires Product Owner/privacy-policy approval;
- implementation should favor non-destructive first steps and explicit repair queries.

## 9. Identifier Contract

| Layer | Identifier |
|---|---|
| Account / auth session | `users.id` |
| Private client aggregate PK | `fiteatsy_clients.id` |
| Public/mobile/client-facing identifier | `fiteatsy_client_id` |
| Internal DB direct ownership FK | `client_id -> fiteatsy_clients.id` |
| Ordinary user APIs | server-derived current client, not caller-chosen client IDs |
| Future professional APIs | approved external identifier such as `fiteatsy_client_id`, with CAP-003 relationship enforcement |
| CAP-001 correlation | separate governed reference, not `users.id` and not `fiteatsy_clients.id` |
| Audit / telemetry | account actor, client subject, and professional actor separated explicitly where relevant |

Implementation note:

- current implementation stores `fiteatsy_clients.id` in a private `text` column and generates UUID-formatted values server-side;
- that private internal identifier must not become a public API contract.

## 10. Authorization Model

Canonical user authorization after M3B:

```text
Bearer Session
  -> Account
  -> Current Fiteatsy Client
  -> Resource ownership check
```

Rules:

- ordinary user APIs must not trust caller-supplied client IDs;
- ordinary user APIs should resolve the current client server-side from the authenticated account;
- resource checks should compare against canonical client ownership or canonical parent ownership;
- deactivated/soft-deleted clients must fail closed;
- mixed ownership during migration must be temporary, explicit, and fully covered by negative tests;
- orphan resources and missing client mappings must fail closed and raise repair signals, not silently bypass ownership checks.

Future professional access compatibility:

- preserve the future model `Role + Tenant/Context + Assignment/Relationship + Data Scope + Consent/Purpose`;
- M3B must not embed any shortcut that turns possession of a client identifier into access.

## 11. API Impact

Routes/contracts requiring M3B-aware ownership resolution:

- `platform` routes and services now keyed by `accountId`;
- any future persisted `reports` endpoints once they stop using in-memory storage;
- any future persisted `wearables` endpoints once durable storage exists;
- any route that reads/writes client-owned health-domain objects using `userId`.

API rules:

- keep `/v1/auth/me` exposing minimal current-client context;
- do not require `clientId` or `fiteatsyClientId` in ordinary user request payloads;
- do not expose the private internal `fiteatsy_clients.id`;
- if future professional/admin flows require a client selector, use explicit public identifiers plus server-side relationship enforcement.

## 12. Mobile / M3C Impact

M3C is still out of scope for implementation, but M3B must leave a safe contract behind.

Required post-M3B contract:

- `/v1/auth/me` should continue exposing the minimal current client summary needed by mobile, including `fiteatsyClientId` and lifecycle status.
- mobile should never receive or persist the private `fiteatsy_clients.id`.
- mobile should not have to send arbitrary client identifiers for ordinary self-service APIs.
- M3C should inherit a backend contract that already resolves current-client ownership server-side.

Current mobile/back-end risk:

- existing mobile/AppContext assumptions were built against account-owned backend resources;
- M3B should finish the backend/domain ownership cutover before M3C starts removing account-oriented assumptions from mobile state and services.

## 13. Migration Strategy

Recommended later implementation sequence:

1. add non-destructive schema additions for canonical client or parent-derived ownership;
2. backfill ownership columns from `users.id -> fiteatsy_clients.id`;
3. validate integrity queries before route/service cutover;
4. switch repositories and authorization checks to client ownership;
5. run protected-baseline regression suite;
6. remove obsolete legacy ownership columns only after verification passes.

Because production data is currently empty:

- the safest recommendation is to perform the ownership transition before real production data arrives;
- long-lived dual-write compatibility is not recommended.

## 14. Rollback / Repair Strategy

Rollback principles:

- first M3B implementation must be additive-first and non-destructive;
- do not drop legacy ownership columns in the same first deployment that introduces new client-owned writes;
- do not rely on irreversible data rewrites before verification.

Repair requirements:

- query for domain rows with missing `client_id`;
- query for domain rows whose `client_id` does not map to `account_user_id` expectations;
- query for child rows whose parent ownership chain is broken;
- query for duplicate active roots where `1:1` is expected;
- fail closed on authorization mismatch and route those rows into repair handling.

Operational failure cases that must be explicitly covered:

- migration succeeds but app deployment fails;
- app deploys but repository cutover uses stale account ownership;
- account exists but client mapping missing;
- client exists but account missing;
- partial backfill;
- post-cutover write lands without client ownership;
- rollback required after writes begin under new model.

## 15. Protected Baseline Risks

M3B must preserve:

- authentication and OTP behavior;
- session persistence/restoration;
- current `M3A` account-to-client resolution;
- PostgreSQL connectivity;
- migration runner and migration packaging;
- Railway deployment health;
- `/health`, `/ready`, `/v1/version`;
- production semantics `NODE_ENV=production` and debug OTP suppression;
- object-level authorization correctness.

Highest-risk implementation mistakes:

- switching domain writes before canonical client resolution is enforced;
- trusting caller-supplied client IDs;
- conflating assignee/audit fields with ownership;
- leaving long-lived mixed account/client ownership in repositories.

## 16. Recommended M3B Implementation Decomposition

### M3B.1 — Ownership Schema Foundation

- add canonical client-owned and parent-derived schema paths;
- add indexes/constraints;
- define integrity queries.

### M3B.2 — Repository and Authorization Transition

- switch platform persistence and authorization to Client ownership;
- preserve auth/session baseline;
- add negative IDOR and mismatch tests.

### M3B.3 — Persisted Domain Surface Alignment

- align notifications, reports schema surfaces, latent checkins/nudges/AI logs, and other persisted health-domain tables;
- keep family/account-social surfaces out of scope.

### M3B.4 — Compatibility Removal and Hardening

- remove redundant legacy account ownership columns only after stable verification;
- complete repair/rollback playbooks.

## 17. Product Owner Decisions Required

The core M3B architecture decisions are now approved. Remaining decision items below are for later-slice detail, not for M3B.1 authorization.

| Decision | Options | Recommended Option | Why | Consequence of Alternative | Blocking M3B Implementation? |
|---|---|---|---|---|---|
| Ownership cutover timing | direct cutover now; long compatibility window; defer until later | direct cutover now | production data is empty and this avoids long-lived dual ownership | later cutover raises migration and authorization risk after real data exists | Yes |
| First-slice ownership scope | migrate all persisted client-domain roots now; partial root-only transition | migrate persisted client-domain roots now, keep family/social and non-persisted runtime stores out of scope | keeps health-domain authority coherent without dragging in unrelated family capability work | partial root migration increases temporary ambiguity | Yes |
| Client data deletion semantics | soft-delete only; cascade delete; governed anonymisation workflow | explicit governed non-destructive first approach pending policy | deletion affects privacy/compliance and should not be guessed | aggressive delete semantics could destroy longitudinal data or violate retention expectations | Yes |
| Deactivated client access behavior | read-only with limited app access; full lockout except recovery flows; other governed state | explicit fail-closed for protected domain writes, with Product Owner approval on allowed reads | prevents accidental access leakage | permissive behavior could create security/privacy issues | Yes |
| Historical owner representation | replace account ownership fields fully; keep some derived actor history separate | replace canonical domain ownership, keep actor/audit fields separate | preserves business history without confusing ownership | keeping account as owner undermines the model | No |
| CAP-001 interaction | correlate later through separate reference; overload current client/account IDs | separate governed correlation reference | prevents identity-contract coupling | overloading current IDs blocks future integration safety | No |

## 18. Dependencies

- accepted `M3A` production baseline;
- authoritative schema/migration baseline from `0001` and `0002`;
- current auth middleware and current-client resolution path;
- Product Owner decision on cutover timing/scope/deletion/deactivation;
- protected-baseline regression plan before implementation approval.

## 19. Risks

- legacy account ownership is spread across more schema surfaces than the active route set currently exercises;
- some persisted tables are latent today, so silent drift is possible if they are omitted from implementation;
- parent-derived ownership needs careful sequencing to avoid orphan rows;
- reports and wearables are not yet DB-authoritative, so contract drift could survive if not explicitly aligned after M3B.

## 20. Assumptions

- M3 still remains `1 Account : 1 Client`.
- `fiteatsy_clients.id` remains a private internal identifier.
- production zero-row evidence remains valid until a later production verification proves otherwise.
- family/caregiver access is future explicit capability work, not implicit M3B scope.

## 21. Scope Exclusions

- no M3B implementation;
- no database migration creation;
- no application code changes;
- no production database changes;
- no Railway changes;
- no M3C mobile implementation;
- no CAP-003 professional-access implementation.
