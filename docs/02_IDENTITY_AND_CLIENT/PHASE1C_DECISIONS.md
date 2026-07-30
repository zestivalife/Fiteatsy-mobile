# M3 — Fiteatsy Client & Identity Definition Register

**Status:** GOVERNANCE / DEFINITION  
**Implementation Status:** NOT YET AUTHORIZED  
**Applies To:** `M3 — Fiteatsy Client & Identity`

## Objective

Establish the durable Fiteatsy Client identity domain that separates:

```text
Account
    ↓
Authentication Identity
    ↓
Fiteatsy Client
    ↓
Longitudinal Health / Wellness Ownership
```

The identity model must support future Consultant / Practitioner / CAP-001 integration without turning internal database IDs into public contracts.

## M3 Definition State

- next governed milestone after the accepted production baseline;
- implementation not yet authorized;
- first required gate: `M3 Definition & Architecture Approval`.

## Decision Register

### A. Account ↔ Client Cardinality

Status:

- `PRODUCT OWNER DECISION REQUIRED`

Options:

1. `1 Account : 1 Client`
2. `1 Account : Many Clients`

Recommendation:

- approve `1 Account : 1 Client` for the first M3 implementation slice;
- treat family/dependants/caregivers as future explicit capability work rather than implicit cardinality expansion.

Why:

- aligns with the current codebase, where authenticated ownership, health profile, care case, nutrition profile, notifications, and reports all attach to one authenticated account context;
- minimizes risk to the accepted production auth/session baseline;
- keeps future multi-client/family support possible without silently overloading current ownership rules.

Consequences:

- `1:1` keeps M3A smaller and migration/backfill safer;
- `1:many` would require additional lifecycle, selection, consent, API, mobile-context, and professional-access design before even the first implementation slice.

### B. Fiteatsy Client Identifier Strategy

Status:

- `RESOLVED FOR DEFINITION`

Architecture:

- internal database primary key: UUID, stored only as an internal relational identifier;
- stable domain identifier: immutable server-generated `fiteatsy_client_id`;
- public/API identifier: `fiteatsy_client_id`, not the internal UUID, when a client identifier must be exposed externally;
- generation mechanism: server-side opaque identifier with deterministic uniqueness guarantees;
- mutability: immutable once created;
- CAP-001 correlation: separate field/relationship; never overload `fiteatsy_client_id` as CAP-001 identity.

Guard:

- raw database primary keys must not become public client contracts.

### C. Client Lifecycle

Status:

- `PARTIALLY RESOLVED`

Resolved baseline semantics:

- creation: a Fiteatsy Client record is created by the backend in a deterministic account-correlated flow;
- active: client can own longitudinal Fiteatsy domain state;
- suspended/deactivated: app access, professional access, and domain operations must respect explicit lifecycle state;
- deletion request: separate from immediate destruction;
- soft deletion/anonymisation: architecture must support them without silently inventing legal retention policy;
- reactivation: must be explicit and auditable where applicable.

Product Owner Decision Required:

- exact event that creates/activates the first Fiteatsy Client at launch:
  1. verified account creation;
  2. first completed onboarding/health-profile activation step;
  3. another explicitly approved trigger.

Recommendation:

- create the client deterministically at verified account completion;
- use a lifecycle status model so “exists” and “active in product workflow” remain distinguishable.

### D. Account vs Client Responsibility Boundary

Status:

- `RESOLVED FOR DEFINITION`

Account owns:

- authentication;
- OTP;
- credentials;
- sessions;
- login/security state;
- account recovery/security events.

Client owns:

- longitudinal Fiteatsy domain identity;
- health profile;
- assessments where Fiteatsy owns them;
- health data;
- reports;
- medications;
- nutrition/profile context;
- wearable/integration state;
- goals;
- care relationships in the Fiteatsy domain.

Guard:

- M3 defines ownership architecture only.
- M3 does not migrate every domain in one uncontrolled step.

### E. CAP-001 Correlation Boundary

Status:

- `RESOLVED FOR DEFINITION`

Rules:

- CAP-001 owns platform Person identity;
- Fiteatsy owns Fiteatsy Account and Fiteatsy Client identity;
- CAP-001 may correlate to Fiteatsy through a governed external reference, not through Fiteatsy internal database IDs;
- correlation does not imply Practitioner assignment, tenant access, or data access;
- tenant/context, assignment/relationship, and consent/purpose remain separate access controls.

### F. Professional Access Principle

Status:

- `RESOLVED FOR DEFINITION`

Future professional access formula:

```text
Role
  + Tenant / Context
  + Assignment / Relationship
  + Data Scope
  + Consent / Purpose
  = Effective Access
```

Guards:

- Practitioner role does not equal access to every Fiteatsy Client;
- Consultant role does not equal access to every Fiteatsy Client;
- CAP-003 governs professional relationship/assignment, not M3.

## Recommended M3 Decomposition

Status:

- `RECOMMENDED; NOT YET IMPLEMENTATION-AUTHORIZED`

### M3A — Client Identity Foundation

- client aggregate;
- stable client identifier;
- account/client relationship;
- persistence;
- repository/domain contracts;
- lifecycle baseline;
- ownership resolution;
- tests.

### M3B — Existing Domain Ownership Transition

- controlled migration from direct account-owned domain references where required;
- health profile ownership;
- care-case/nutrition/report/notification compatibility;
- transition safety and backfill execution.

### M3C — Mobile Client Context Integration

- mobile/backend client identity contract;
- AppContext/service integration;
- removal of inappropriate account-ID assumptions.

Dependency order:

- `M3A` before `M3B` because downstream ownership migration requires a stable client contract;
- `M3B` before `M3C` because mobile should not adopt a contract the backend cannot yet honor durably.

## Current Data Migration Strategy

Status:

- `DEFINED FOR GOVERNANCE; NOT IMPLEMENTED`

Required strategy:

1. create client records for existing production accounts;
2. use deterministic account → client correlation;
3. make backfill idempotent;
4. preserve uniqueness constraints;
5. maintain compatibility while both account-linked and client-linked ownership may coexist during transition;
6. migrate health profile, care case, nutrition, report, and notification ownership in controlled steps;
7. verify backfill results before removing compatibility paths;
8. define rollback handling for partial migration failure;
9. target zero/low downtime with additive-first changes;
10. verify ownership integrity after migration.

Guard:

- M3 must not blindly switch production ownership without a backfill/verification plan.

## API Contract Strategy

Status:

- `RESOLVED FOR DEFINITION`

Rules:

- authenticated user routes infer current client server-side;
- caller-supplied client identifiers are not trusted for ordinary user-scoped APIs;
- client IDs may be accepted only where an approved contract explicitly requires them and server-side ownership/scope checks still apply;
- public identifiers must use `fiteatsy_client_id`, not raw internal IDs;
- backward compatibility must be explicit during transition;
- professional-context access uses separate trusted/service access patterns plus CAP-003 relationship enforcement.

Prohibited pattern:

```text
authenticated user sends arbitrary clientId
→ backend trusts clientId
→ backend returns another person's health data
```

## Security / Privacy Threat Review

Status:

- `RESOLVED FOR DEFINITION`

| Threat | Required Architectural Control |
|---|---|
| IDOR | server-side ownership resolution and object-level authorization |
| client enumeration | opaque public identifiers and scoped lookup rules |
| internal ID leakage | never expose raw DB IDs as the public client contract |
| account/client mismatch | deterministic account-client mapping plus migration verification |
| orphan clients | lifecycle and referential integrity controls |
| duplicate clients | uniqueness constraints and idempotent backfill |
| unauthorized professional access | CAP-003 relationship and purpose-based access controls |
| cross-tenant access | tenant/context-aware authorization boundary |
| stale sessions after lifecycle changes | lifecycle-aware auth/session invalidation rules |
| account deletion vs retained health data | explicit deletion/anonymisation workflow; no silent policy invention |
| migration ownership corruption | additive-first migration, verification queries, rollback plan |

## Protected Production Baseline Regression Requirements

Any future M3 implementation must explicitly regression-test:

- authentication;
- OTP behavior;
- session persistence/restoration;
- object-level authorization;
- PostgreSQL connectivity;
- migration runner;
- migration packaging;
- Railway deployment configuration;
- `/health`;
- `/ready`;
- `/v1/version`;
- production environment semantics;
- debug OTP suppression.

## M3 Definition Gate Acceptance Criteria

The M3 definition/architecture gate may pass only when:

- governance conflict is removed;
- M3 is explicitly identified as next;
- M3 implementation remains explicitly unauthorized;
- cardinality is approved or explicitly escalated;
- client identifier strategy is defined;
- lifecycle semantics are defined or explicitly escalated where product policy is required;
- Account vs Client ownership boundary is documented;
- CAP-001 correlation boundary is documented;
- professional-access boundary is documented;
- migration strategy is documented;
- API ownership strategy is documented;
- security threat controls are documented;
- recommended implementation decomposition is documented;
- protected-baseline regression requirements are documented;
- implementation acceptance criteria are measurable.
