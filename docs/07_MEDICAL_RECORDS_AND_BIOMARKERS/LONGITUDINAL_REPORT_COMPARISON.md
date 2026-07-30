# Fiteatsy — Longitudinal Report Comparison

## Objective

Allow users and Practitioners to understand how compatible biomarkers change across reports.

## Comparison Preconditions

Before comparing two observations verify:

- same canonical biomarker;
- compatible units;
- valid dates;
- acceptable extraction/validation state.

## Trend Model

```text
Report A        Report B        Report C
   |               |               |
   v               v               v
Biomarker X --> Biomarker X --> Biomarker X
                     |
                     v
              Longitudinal Trend
```

## Change

The platform may calculate deterministic changes such as:

- absolute difference;
- percentage difference where mathematically/product appropriate;
- direction of change.

## Important Guard

"Up" does not necessarily mean better.
"Down" does not necessarily mean worse.

Clinical/product interpretation must be biomarker-specific and governed.

## Reference Range Changes

Historical reports may contain different laboratory ranges.

The UI should not silently apply the newest range to every historical observation.

## Missing Tests

A biomarker absent from a later report means "not present in that report", not zero.

## User Presentation

The user experience should separate:

- measured value;
- historical trend;
- source range;
- product explanation.

This reduces the risk of presenting generated narrative as source medical data.
