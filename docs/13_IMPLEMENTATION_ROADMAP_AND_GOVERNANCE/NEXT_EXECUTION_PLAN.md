# Fiteatsy — Next Execution Plan

## Current Recommended Next Step

Do not begin new feature implementation yet.

The next engineering action is:

`M3B — Existing Domain Ownership Transition Definition / Governance`

This is documentation, architecture, sequencing and change-control work only.

It does not authorize migrations, backend implementation, mobile implementation, or production changes.

## Current Definition / Governance Scope

Codex should establish one authoritative M3B definition that:

- identifies the exact ownership surfaces moving from direct `user_id` references to client-owned contracts;
- defines compatibility, migration, rollback, and authorization strategy;
- keeps `M3B` implementation explicitly unauthorized;
- identifies Product Owner decisions still required before an ownership-transition prompt can be approved.

## Recommended Post-Definition Implementation Order

After the M3B definition/architecture gate is approved:

### M3B — Existing Domain Ownership Transition

- controlled migration from direct `user_id` ownership where required;
- health-profile / care-case / nutrition / report / notification compatibility;
- backfill and rollback strategy execution.

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

M3A is production-accepted, so the next meaningful risk boundary is controlled ownership transition rather than another client-identity foundation change.
