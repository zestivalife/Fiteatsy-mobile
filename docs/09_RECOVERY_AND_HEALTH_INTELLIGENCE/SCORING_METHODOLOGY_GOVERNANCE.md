# Fiteatsy — Scoring Methodology Governance

## Rule

No recovery score or Daily Improvement Matrix methodology enters production without an explicit specification.

## Methodology Specification

Each methodology should define:

- methodology_id;
- version;
- intended population/use;
- included signals;
- exclusions;
- baseline rules;
- aggregation rules;
- weights, if any;
- missing-data handling;
- freshness limits;
- output interpretation;
- known limitations;
- test cases;
- approval status.

## Versioning

Historical results retain the methodology version used to calculate them.

A new methodology version must not silently rewrite historical meaning.

## Determinism

Where calculations are deterministic, identical approved inputs + methodology version should reproduce the same result.

## AI

LLMs must not secretly determine weights or scoring logic at runtime.

## Validation

Methodology validation should include representative scenarios and boundary cases before production use.

## Governance

Clinical or condition-specific claims require appropriate domain review. Engineering/Codex must not invent them.
