# Fiteatsy — Recovery / Progress API

**Status:** TARGET; METHODOLOGY REQUIRED BEFORE IMPLEMENTATION

## Purpose

Expose governed progress/recovery outputs to the user and authorised practitioner systems.

## Potential Operations

- current progress/recovery indicator;
- historical indicators;
- component/dimension results;
- input coverage;
- data freshness;
- methodology version;
- user-friendly explanation.

## Response Requirements

A result should expose enough context to avoid false precision.

Conceptually:

```json
{
  "status": "available",
  "period": "YYYY-MM-DD",
  "methodology_version": "...",
  "data_freshness": "...",
  "input_coverage": {},
  "components": [],
  "result": {},
  "explanation": {}
}
```

## Insufficient Data

The API must support:

```text
status = insufficient_data
```

rather than manufacturing a score.

## AI Explanation

If an AI explanation is present, it must remain distinguishable from the deterministic result.
