# Fiteatsy — Next Execution Plan

## Current Recommended Next Step

Do not begin new feature implementation yet.

The next engineering action is:

`M3 — Fiteatsy Client & Identity Definition / Governance`

This is documentation, architecture, sequencing and change-control work only.

It does not authorize migrations, backend implementation, mobile implementation, or production changes.

## Current Definition / Governance Scope

Codex should establish one authoritative M3 definition that:

- resolves stale D0/pre-production “next task” instructions;
- identifies M3 as the next governed milestone;
- keeps M3 implementation explicitly unauthorized;
- defines Account vs Client boundaries;
- defines/recommends client identity and lifecycle strategy;
- defines migration, API, and regression strategy;
- identifies Product Owner decisions that still require approval.

## Recommended Post-Definition Implementation Order

After the M3 definition/architecture gate is approved:

### M3A — Client Identity Foundation

- client aggregate;
- stable client identifier;
- account/client relationship;
- persistence/repository contracts;
- lifecycle baseline;
- protected-baseline regression suite.

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

The production runtime foundation is now accepted, so the next meaningful risk boundary is identity/client architecture rather than another deployment-readiness pass.
