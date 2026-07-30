# Fiteatsy — Failure and Resilience Model

**Status:** TARGET BASELINE

## Principle

Health data is often delayed, duplicated, incomplete or temporarily unavailable. The system must represent uncertainty rather than manufacture continuity.

## Database Failure

If authoritative persistence is unavailable:

- do not acknowledge durable mutation success;
- expose an appropriate service failure;
- preserve retry-safe client behaviour.

## Device Sync Failure

If device health synchronization fails:

- preserve the last successful checkpoint;
- do not mark missing values as zero;
- show stale/freshness state where relevant;
- retry without duplicating observations.

## External Provider Failure

Provider failure must not corrupt canonical data.

Use:

- bounded timeout;
- retry where safe;
- circuit/rate controls when justified;
- provider-specific error classification.

## Report Processing Failure

The original report record/file should remain intact.

Processing should have an explicit status such as pending/processing/completed/failed rather than making the report disappear.

## Consultant Sync Failure

Fiteatsy remains authoritative.

Failed projection/event delivery must be retryable and reconcilable.

Consultant failure must not block normal Fiteatsy health-data persistence.

## Partial Data

The product must distinguish:

- no measurement;
- unavailable source;
- revoked permission;
- stale data;
- failed synchronization;
- actual measured zero/value.
