# Fiteatsy — Deduplication & Historical Corrections

## Problem

Health sources may return overlapping windows, duplicate records or corrected historical records.

## Identity Strategy

Prefer stable source/provider record identifiers where available.

Where unavailable, a governed deterministic source key may be required.

## Idempotency

Repeated ingestion of the same source observation must not create uncontrolled duplicate longitudinal records.

## Corrections

If a provider updates a historical observation, Fiteatsy should support a controlled update/version strategy.

## Source Separation

Similar measurements from two sources are not necessarily duplicates.

Example:

```text
Apple Watch heart-rate sample
!=
manual heart-rate entry
```

even if value and timestamp are close.

## Deletion From Source

Source deletion semantics require provider-specific treatment.

Do not automatically delete Fiteatsy history merely because a subsequent source query omits an old record; omission may result from windowing, permissions or provider behaviour.

## Auditability

Where a health observation is materially corrected, retain enough metadata to understand the correction path.
