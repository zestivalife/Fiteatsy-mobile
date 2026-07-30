# Fiteatsy — Next Execution Plan

## Current Recommended Next Step

Do not begin new feature implementation yet.

The next engineering action is:

`M3B.1 — Production Verification / Acceptance`

The schema-foundation implementation now exists and the next step is deployment/runtime verification plus acceptance evidence.

It does not authorize `M3B.2`, `M3B.3`, `M3B.4`, mobile ownership conversion, or professional-access work.

## Current Authorized Scope

The authoritative architecture package remains:

`docs/02_IDENTITY_AND_CLIENT/M3B_EXISTING_DOMAIN_OWNERSHIP_TRANSITION_REVIEW.md`

The currently implemented slice is:

`M3B.1 — Ownership Schema Foundation`

## Current Governance Scope

The next governance action is to verify and accept the M3B.1 slice that:

- identifies the exact ownership surfaces moving from direct `user_id` references to client-owned contracts;
- adds canonical `client_id` ownership columns for approved direct roots;
- backfills through `account_user_id -> fiteatsy_clients.id`;
- preserves transitional `user_id` compatibility without authorizing the repository transition;
- keeps `M3B.2+` explicitly unauthorized.

## Recommended Post-Definition Implementation Order

After M3B.1 is production-verified and accepted:

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

M3A is production-accepted and the first M3B slice is now implemented, so the next meaningful risk boundary is verifying the live schema foundation before authorizing the repository/runtime transition.
