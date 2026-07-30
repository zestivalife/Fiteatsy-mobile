# Fiteatsy — Initial Backfill & Reconciliation

## Initial Backfill

When Consultant integration first goes live, existing eligible Fiteatsy clients may need to be projected.

Required characteristics:

- authenticated service access;
- pagination;
- bounded batch size;
- deterministic ordering/cursor;
- source version;
- resumability;
- idempotent upsert.

## Do Not

Do not run a one-off unmanaged database copy from Fiteatsy PostgreSQL to Consultant PostgreSQL.

## Incremental After Backfill

After initial projection:

```text
Backfill Snapshot
      |
      v
Incremental Events
      |
      v
Periodic Reconciliation
```

## Reconciliation

Reconciliation verifies that Consultant projections match authoritative Fiteatsy client lifecycle/version state.

It should detect:

- missing client;
- stale version;
- unexpected active/inactive state;
- failed event delivery;
- duplicate projection;
- orphaned mapping.

## Repair

Repair operations should be idempotent and auditable.

## Health Data

Reconciliation of the minimal client projection does not require copying all historical health data.
