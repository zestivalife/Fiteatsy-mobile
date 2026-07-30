# Fiteatsy — Consultant Trusted API

**Status:** TARGET; NOT YET IMPLEMENTED

## Purpose

Allow the Consultant / Practitioner platform to obtain Fiteatsy client context without sharing the Fiteatsy database.

## Trust Boundary

This API is backend-to-backend.

It must not rely on a Fiteatsy mobile/user Bearer token as service identity.

## Authorization Flow

```text
Practitioner
    |
    v
Consultant Backend
    |
    v
CAP-003 Assignment Authorization
    |
    v
Trusted Fiteatsy API
    |
    v
Authorised Fiteatsy Context
```

The final contract may additionally require Fiteatsy to validate scoped access claims or platform authorization context.

## Potential API Categories

### Client Projection / Resolution

- resolve Fiteatsy client by governed external reference;
- retrieve minimal lifecycle/display context.

### Health Context

- latest approved health metrics;
- health trends;
- freshness.

### Reports / Biomarkers

- report summaries;
- biomarker history/trends;
- source/provenance as appropriate.

### Progress

- latest recovery/progress indicators;
- historical trend.

### Medication

Excluded by default until explicitly approved.

## Data Minimisation

Consultant should request the minimum required health context.

Detailed raw health observations should not automatically be replicated.

## Integration Pattern

Use a combination of:

- minimal local projection;
- trusted query APIs;
- durable change events;
- reconciliation.

## No Database Sharing

Consultant must never query Fiteatsy PostgreSQL directly.
