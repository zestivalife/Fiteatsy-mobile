# Fiteatsy — Practitioner Report Context

## Objective

Provide authorised Practitioners useful longitudinal report and biomarker context without copying every report artifact into Consultant.

## Recommended Model

```text
Consultant
   |
   | CAP-003 authorised
   v
Fiteatsy Trusted API
   |
   +-- Report Timeline
   +-- Processing Status
   +-- Biomarker Trends
   +-- Report Summary
   +-- Freshness / Provenance
```

## Raw Report Access

Raw report viewing by Practitioners requires an explicit access policy.

If approved, use controlled Fiteatsy access rather than permanently duplicating report files into Consultant storage by default.

## Practitioner Dashboard

Useful context may include:

- report date;
- report type/source metadata;
- processing state;
- key approved biomarker trends;
- latest/previous values;
- source ranges;
- report summary;
- data quality/review state.

## CAP-003

Fiteatsy must not infer Practitioner authorization from legacy consultant/mentor assignment fields.

## Audit

Professional access to sensitive report content should be auditable where required.
