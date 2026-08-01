# Fiteatsy — Next Execution Plan

## Current Recommended Next Step

Do not begin new feature implementation yet.

The next engineering action is:

`M3B.2 — Repository and Authorization Transition (Definition / Readiness Review)`

The schema-foundation implementation is now production-accepted. The next step is a tightly scoped definition/readiness review for the repository and authorization transition, not implementation.

It does not authorize `M3B.2`, `M3B.3`, `M3B.4`, mobile ownership conversion, or professional-access work.

## Current Authorized Scope

The authoritative architecture package remains:

`docs/02_IDENTITY_AND_CLIENT/M3B_EXISTING_DOMAIN_OWNERSHIP_TRANSITION_REVIEW.md`

The accepted slice is:

`M3B.1 — Ownership Schema Foundation`

## Current Governance Scope

The next governance action is to define and readiness-review the M3B.2 slice that:

- confirms exactly which repositories and services still enforce `user_id` ownership;
- locks the conversion order to server-derived current-client ownership;
- defines object-level authorization and anti-IDOR behavior during the transition;
- confirms fail-closed handling for missing or mismatched client ownership;
- preserves protected auth/session/current-client regressions as mandatory gates;
- keeps `M3B.2+` explicitly unauthorized for implementation.

## Recommended Post-Definition Implementation Order

After M3B.2 is defined and explicitly authorized:

### M3B.2 — Repository & Authorization Transition

- repository/service ownership conversion from account to Client;
- server-side client authorization enforcement on owned resources;
- negative IDOR and mismatch regression coverage.

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

M3A and M3B.1 are production-accepted, so the next meaningful risk boundary is correctly defining the repository/runtime ownership cutover before authorizing implementation.
