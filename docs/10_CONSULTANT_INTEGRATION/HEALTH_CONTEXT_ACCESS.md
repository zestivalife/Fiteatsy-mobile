# Fiteatsy — Practitioner Health Context Access

## Purpose

Allow Consultant to obtain current authorised Fiteatsy health context without maintaining a complete duplicate health database.

## Potential Context

Subject to product approval:

- latest approved health metrics;
- longitudinal trend summaries;
- data freshness;
- report timeline;
- biomarker history/trends;
- recovery/progress results;
- approved medication context;
- source/provenance.

## Request Flow

```text
Practitioner
    |
    v
Consultant UI
    |
    v
Consultant Backend
    |
    v
CAP-003 Authorisation
    |
    v
Trusted Fiteatsy API
    |
    v
Minimum Required Health Context
```

## Data Minimisation

Different Practitioner screens should request the data they need rather than receiving a giant client payload.

## Freshness

Responses should expose appropriate freshness/source timestamps.

## Raw Health Data

Raw high-volume observations should only be exposed where a real professional workflow requires them.

Trend/aggregate APIs are often more appropriate for dashboards.

## Reports

Raw report access, if approved, should use controlled access rather than permanent public URLs.
