# Fiteatsy — Delivery Status Model

## Allowed Statuses

- PLANNED
- ARCHITECTURE_APPROVED
- IMPLEMENTATION_IN_PROGRESS
- IMPLEMENTED
- LOCALLY_VERIFIED
- STAGING_DEPLOYED
- STAGING_VERIFIED
- PRODUCTION_DEPLOYED
- PRODUCTION_VERIFIED
- PRODUCTION_ACCEPTED
- BLOCKED
- DEFERRED

## Rules

`IMPLEMENTED` means code exists.

`LOCALLY_VERIFIED` means feasible local verification passed.

`STAGING_VERIFIED` means deployed runtime against staging dependencies was verified.

`PRODUCTION_VERIFIED` means expected production runtime was technically verified.

`PRODUCTION_ACCEPTED` requires explicit acceptance gate.

## Blocked

A blocked item must state:

- blocker;
- evidence;
- what is needed to unblock;
- whether dependent work may safely continue.
