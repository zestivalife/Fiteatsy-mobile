# Fiteatsy — Consultant Health Data Projection

## Principle

Consultant should not maintain an uncontrolled full replica of Fiteatsy health observations.

## Recommended Pattern

```text
Fiteatsy
 |
 +-- Minimal Client Projection ----> Consultant DB
 |
 +-- Change/Freshness Signal ------> Consultant
 |
 +-- Trusted Health API <----------- Consultant Query
```

## Local Consultant Projection

Suitable data may include:

- Fiteatsy client reference;
- product status;
- display context;
- latest sync/freshness summary;
- source version/update timestamp.

## Query-On-Demand Health Context

Suitable candidates:

- latest metrics;
- trends;
- biomarker history;
- report summaries;
- recovery/progress indicators.

## CAP-003

Consultant must verify Practitioner Assignment before exposing health context.

## Dashboard Freshness

The practitioner dashboard should communicate when the latest Fiteatsy health data was measured/synchronised.

## Future Alerts

If future Fiteatsy logic produces a governed review signal, that may be delivered to Consultant as an event.

This is different from granting Consultant direct access to every raw observation.
