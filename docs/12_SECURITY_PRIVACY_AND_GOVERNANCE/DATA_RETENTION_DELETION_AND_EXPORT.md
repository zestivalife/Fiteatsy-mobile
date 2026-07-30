# Fiteatsy — Data Retention, Deletion & Export

**Status:** POLICY DECISIONS REQUIRED

## Lifecycle

The platform needs explicit policies for:

- account deactivation;
- Fiteatsy Client deactivation;
- deletion request;
- report deletion;
- health observation retention;
- backups;
- derived data;
- audit records;
- Consultant projections.

## Soft Delete vs Erasure

`deleted_at` is a technical mechanism, not a complete privacy policy.

A deletion workflow may need to coordinate:

```text
Fiteatsy DB
Object Storage
Background Jobs
Caches
Consultant Projection
Backups / Retention
```

## Export

If user data export is supported, it should be authenticated, bounded and auditable.

## Referential Integrity

Deletion must not create unsafe orphaned records or accidental reassignment.

## Policy Guard

Exact retention periods and statutory obligations require approved legal/privacy policy.

Engineering must not invent durations.
