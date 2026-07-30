# Fiteatsy — Recovery & Progress Data Model

**Status:** TARGET; METHODOLOGY NOT YET APPROVED

## Rule

Do not create a generic `health_score` column and treat it as clinical truth.

Progress outputs must preserve how they were calculated.

## Conceptual Record

A progress/recovery record may include:

- client_ref;
- period/date;
- methodology_id;
- methodology_version;
- input coverage;
- source freshness;
- component scores/indicators;
- final indicator if methodology defines one;
- interpretation category;
- calculation timestamp;
- recalculation reason;
- provenance.

## Reproducibility

Given the same approved inputs and methodology version, deterministic calculations should be reproducible.

## Versioning

If methodology changes, historical scores should retain the original methodology version rather than silently being reinterpreted.

## Missing Data

The model must support "insufficient data" rather than manufacturing a score.
