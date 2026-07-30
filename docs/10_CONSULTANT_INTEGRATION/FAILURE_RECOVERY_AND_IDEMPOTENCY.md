# Fiteatsy — Integration Failure Recovery & Idempotency

## Principle

Consultant downtime must not prevent Fiteatsy from recording user health data.

Fiteatsy downtime must not corrupt Consultant assignment state.

## Failure Examples

- Consultant unavailable;
- Fiteatsy unavailable;
- service credential expired;
- event delivery timeout;
- duplicate event;
- out-of-order event;
- stale projection;
- CAP-003 unavailable;
- reconciliation interrupted.

## Idempotency

Projection/event consumers should safely process the same logical change more than once.

## Version Protection

Older source versions must not overwrite newer projections.

## Retry

Retry transient failures with bounded backoff.

Permanent authorization/contract failures require operational visibility rather than infinite retry.

## Dead-Letter / Failed Delivery

When asynchronous infrastructure is introduced, failed deliveries require an inspectable failure state.

## Recovery

The system must be recoverable using authoritative source data plus reconciliation.

It must not rely solely on "we hope every event was delivered."
