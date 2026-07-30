# Fiteatsy — Recovery & Health Intelligence Implementation Sequence

## R0 — Data Foundation

Required first:

- Railway runtime verified;
- Fiteatsy Client identity;
- canonical health observations;
- longitudinal queries;
- report/biomarker model where used.

## R1 — Define Product Outcomes

Specify what the Daily Improvement Matrix is intended to communicate.

Do this before coding a score.

## R2 — Select Launch Signals

Approve a bounded signal set.

Avoid implementing every possible wearable metric.

## R3 — Baseline & Aggregation

Implement/test:

- baseline;
- metric-specific aggregation;
- trend windows;
- missing-data rules;
- freshness.

## R4 — Methodology v1

Write and approve a versioned methodology specification with test scenarios.

## R5 — Deterministic Engine

Implement calculation independently from AI explanation.

Persist methodology version, input coverage and output.

## R6 — User Experience

Expose:

- progress;
- trend;
- coverage/freshness;
- explanations;
- insufficient-data state.

## R7 — AI Explanation

Only after structured results are stable.

Integrate through governed AI contracts rather than embedding uncontrolled prompts throughout the app.

## R8 — Practitioner Context

After CAP-003/trusted integration:

- progress projection/query;
- trend context;
- review signals;
- provenance/freshness.

## R9 — Intervention Correlation

Add versioned intervention overlays after authoritative intervention contracts exist.

## Engineering Efficiency Rule

Do not ask Codex to invent the methodology while implementing the engine.

Methodology design and software implementation are separate tasks. This prevents expensive rewrites and unsafe assumptions.
