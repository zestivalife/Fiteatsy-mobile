# Fiteatsy — Next Execution Plan

## Current Recommended Next Step

Do not begin new feature implementation yet.

The next engineering action is:

`M3B.2 — Repository and Authorization Transition (DB-backed Regression / Production Verification)`

The schema-foundation implementation is production-accepted, and the M3B.2 repository/authorization transition has been implemented locally. The next step is verification, not M3B.3 implementation.

It does not authorize `M3B.3`, `M3B.4`, mobile ownership conversion, or professional-access work.

## Current Authorized Scope

The authoritative architecture package remains:

`docs/02_IDENTITY_AND_CLIENT/M3B_EXISTING_DOMAIN_OWNERSHIP_TRANSITION_REVIEW.md`

The accepted slice is:

`M3B.1 — Ownership Schema Foundation`

The implemented-but-not-yet-accepted slice is:

`M3B.2 — Repository & Authorization Transition`

## Current Governance Scope

The next governance action is to verify the M3B.2 slice that:

- confirms DB-backed repositories write and query `client_id` for `health_profiles`, `care_cases`, `nutrition_profiles`, and `notifications`;
- confirms object-level authorization fails closed on cross-client care-case access;
- confirms public responses do not expose internal `client_id`;
- confirms auth/session/current-client regressions remain protected;
- captures production runtime evidence before Product Owner acceptance;
- keeps `M3B.3+` explicitly unauthorized for implementation.

## Recommended Post-Verification Implementation Order

After M3B.2 is DB-verified, production-verified, and explicitly accepted:

### M3B.3 — Persisted Domain Surface Alignment

- remaining persisted ownership surfaces beyond the platform root path;
- compatibility cleanup across reports/notifications/attachments and related tables.

### M3B.4 — Compatibility Removal / Hardening

- removal of obsolete compatibility fields and paths only after evidence-backed verification.

### M3C — Mobile Client Context Integration

- mobile/backend client context contract;
- AppContext/service integration;
- removal of inappropriate account-ID assumptions.

## Historical / Superseded Execution Plan

The following execution plan is historical and completed/superseded by the accepted production baseline:

- `Task A — Railway Readiness Audit`
- `Task B — Minimal Railway Preparation`
- `Task C — Create Railway Runtime`
- `Task D — Phase 1B Runtime Verification`

Those steps remain useful historical evidence but are no longer the active next task.

## Why This Order

M3A and M3B.1 are production-accepted, and M3B.2 is implemented but not yet accepted. The next meaningful risk boundary is DB-backed proof that runtime ownership and anti-IDOR behavior now follow server-derived current-client ownership before any broader persistence alignment begins.
