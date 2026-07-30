# Fiteatsy — Integration & Audit Persistence

## Integration State

Cross-system delivery needs its own durable state.

Potential structures include:

- outbox event;
- delivery attempt;
- consumer/projection checkpoint;
- reconciliation run;
- idempotency record.

## Outbox

A future outbox record should capture enough information to reliably publish a committed domain change after the originating transaction succeeds.

## Reconciliation

Consultant projection sync must support detecting:

- missing records;
- stale versions;
- failed delivery;
- unexpected source/destination divergence.

## Audit

Sensitive actions may require auditable records such as:

- report access;
- practitioner health-context access;
- lifecycle changes;
- administrative actions;
- integration delivery.

Audit records should not become an uncontrolled copy of full sensitive payloads.

## Correlation

Requests/jobs/events should support correlation identifiers for operational tracing.
