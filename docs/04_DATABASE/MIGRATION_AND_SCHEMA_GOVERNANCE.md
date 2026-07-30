# Fiteatsy — Migration & Schema Governance

## Migration Rule

Database changes are applied through versioned migrations.

`schema.sql` may serve as a reference snapshot but must not replace migration history.

## Requirements

Every migration should be:

- versioned;
- reviewable;
- deterministic;
- safe for the intended environment;
- verified after deployment.

## Deployment

Application startup must not create uncontrolled schema drift.

If automatic migration-on-start is retained, concurrency and failure behaviour must be explicitly safe.

## Backward Compatibility

When mobile/backend versions may overlap, schema/API changes should consider compatibility during rollout.

## Destructive Changes

Dropping/rewriting health data requires explicit approval and a migration/rollback plan.

## Phase 1B

The existing `0001_phase1b_persistence_foundation.sql` remains part of the implementation baseline and must be runtime-verified against the Railway staging database before Phase 1B is closed.

## Phase 1C

Client-domain migrations must wait until Account → Client and `fiteatsy_client_id` decisions are approved.
