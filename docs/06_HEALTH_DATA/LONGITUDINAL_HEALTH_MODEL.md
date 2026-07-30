# Fiteatsy — Longitudinal Health Model

## Purpose

Fiteatsy should make health change over time understandable.

## Timeline

```text
Historical Baseline
      |
      v
Daily / Periodic Observations
      |
      v
Metric-specific Aggregation
      |
      v
Trend Windows
      |
      v
Change / Progress Context
```

## Raw vs Aggregated

Raw/source observations and daily/weekly summaries are different data products.

Do not destroy raw provenance merely because aggregates are convenient for UI.

## Time Windows

Trend windows should be explicit, such as:

- current day;
- 7-day;
- 30-day;
- clinically/product-approved custom periods.

## Baselines

Recovery/progress baselines require explicit methodology.

A user's first available reading is not automatically an appropriate baseline.

## Biomarkers

Laboratory biomarkers join the longitudinal health view but remain a separate observation class with report provenance.

## Intervention Overlay

Future practitioner views may correlate intervention periods with health trends.

Correlation must not be presented as proof that an intervention caused a change.
