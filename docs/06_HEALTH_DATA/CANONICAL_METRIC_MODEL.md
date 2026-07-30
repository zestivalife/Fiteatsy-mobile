# Fiteatsy — Canonical Metric Model

**Status:** TARGET; LAUNCH METRIC LIST NOT YET FROZEN

## Purpose

Normalise source-specific health measurements into governed Fiteatsy metric definitions.

## Metric Definition

Each supported metric should eventually define:

- canonical code;
- display name;
- canonical unit;
- data type;
- aggregation semantics;
- valid/expected range policy where appropriate;
- supported sources;
- freshness expectations;
- whether user-facing;
- whether practitioner-facing;
- whether eligible for recovery/progress calculations.

## Candidate Metric Families

### Activity

- steps;
- active energy;
- exercise/workout duration;
- distance where approved.

### Cardiovascular

- heart rate;
- resting heart rate;
- HRV.

### Sleep

- sleep duration;
- sleep stages where source support and product methodology justify them.

### Respiratory / Oxygen

- SpO2 where supported.

### Body Measurements

- weight;
- other approved body measurements.

## Units

Canonical units must be explicit.

Source units should be preserved where useful for provenance, but downstream calculations should use canonical units.

## Aggregation

Metrics have different semantics.

For example, summing a day's steps may make sense, while averaging arbitrary heart-rate samples may not represent resting heart rate.

Aggregation rules must be metric-specific.

## Guard

Do not create one generic "health metric" algorithm that treats all numeric observations identically.
