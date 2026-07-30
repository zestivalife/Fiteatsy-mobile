# Fiteatsy — Practitioner Recovery Context

## Objective

Give an authorised Practitioner a concise view of client progress while preserving access boundaries and source traceability.

## Potential Dashboard Context

```text
Client
├── Latest health-data freshness
├── Daily/periodic progress status
├── Dimension trends
├── Wearable trend summaries
├── Biomarker trajectory
├── Report timeline
├── Data coverage
└── Review signals
```

## Access

```text
Practitioner
    |
    v
CAP-003 Assignment
    |
    v
Consultant Backend
    |
    v
Fiteatsy Trusted API
```

## Raw vs Derived

Practitioner UI should distinguish:

- source observation;
- aggregate;
- derived progress result;
- AI explanation.

## Review Signals

A future review signal may highlight material changes for Practitioner attention.

It must not automatically be described as a medical emergency alert unless a separately validated safety capability supports that claim.

## Freshness

Practitioner decisions require visibility into how recent the underlying data is.
