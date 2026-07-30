# Fiteatsy — Data Coverage, Freshness & Confidence

## Why Coverage Matters

A progress result based on one stale signal should not look as reliable as one based on complete current data.

## Coverage

A methodology may calculate coverage from:

- required signals available;
- expected observation days available;
- report/biomarker availability;
- source connectivity.

## Freshness

Different signals have different freshness expectations.

Examples:

- wearable data may be expected frequently;
- laboratory biomarkers may legitimately be months apart.

## Confidence

If the product exposes confidence, it must have a defined meaning.

Do not invent an AI confidence percentage with no calibration.

## Insufficient Data

The engine must be able to return:

```text
INSUFFICIENT_DATA
```

with reasons such as:

- source not connected;
- insufficient baseline;
- stale observations;
- required biomarker unavailable;
- permission revoked.

## UI

Coverage/freshness should be communicated in understandable terms without overwhelming the user.
