# Fiteatsy — Consultant Integration Implementation Sequence

## CI-0 — Prerequisites

Do not begin production integration until:

- Fiteatsy Railway backend is operational;
- Fiteatsy PostgreSQL is operational;
- Phase 1C Fiteatsy Client identity exists;
- CAP-001 cross-system reference contract is defined;
- Consultant CAP-002/CAP-003 boundaries are stable enough for integration.

## CI-1 — Integration Contract Freeze

Approve:

- client external identifier;
- CAP-001 correlation field;
- minimal client projection;
- source version semantics;
- service authentication approach.

## CI-2 — Trusted Service Authentication

Implement machine-to-machine authentication between Consultant and Fiteatsy.

Verify environment isolation and credential rotation.

## CI-3 — Client Projection API

Implement bounded/paginated projection retrieval suitable for initial backfill and reconciliation.

## CI-4 — Initial Backfill

Synchronise eligible Fiteatsy clients into Consultant as product projections.

Do not copy full health histories.

## CI-5 — Incremental Client Events

Implement durable lifecycle/projection events using an outbox or equivalent reliable pattern.

## CI-6 — CAP-003 Integration

Ensure Practitioner Assignment is the authorization authority.

Add boundary tests proving Fiteatsy client existence does not grant access.

## CI-7 — Trusted Health Context API

Expose approved health trends, reports/biomarkers and progress context.

Implement object-level authorization and data minimisation.

## CI-8 — Reconciliation

Implement scheduled/on-demand reconciliation for projection drift.

## CI-9 — Observability & Production Acceptance

Verify:

- auth;
- authorization;
- event delivery;
- idempotency;
- backfill;
- reconciliation;
- audit;
- version endpoints;
- health endpoints;
- expected deployment commit;
- browser/API runtime behaviour.

## Engineering Efficiency Rule

Do not ask Codex to modify both repositories end-to-end in one uncontrolled prompt.

Use contract-first phases, then give each repository a narrow implementation task against the frozen contract.
