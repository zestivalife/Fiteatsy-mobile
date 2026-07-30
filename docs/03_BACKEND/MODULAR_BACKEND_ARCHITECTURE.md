# Fiteatsy — Modular Backend Architecture

**Status:** TARGET INTERNAL STRUCTURE

## 1. Strategy

The existing Express backend should evolve as a modular backend first.

Do not create one Railway service per feature before operational evidence justifies it.

## 2. Logical Modules

```text
Fiteatsy API
|
+-- Auth
+-- Client
+-- Health Profile
+-- Health Ingestion
+-- Health Observations
+-- Medical Reports
+-- Biomarkers
+-- Medication
+-- Recovery / Progress
+-- Notifications
+-- Integration
+-- Audit / Sync
```

A module should expose a clear internal contract and avoid reaching into another module's persistence implementation.

## 3. Layering

Preferred module shape:

```text
Route / Controller
       |
       v
Application Service
       |
       v
Domain Rules
       |
       v
Repository / Integration Port
       |
       v
PostgreSQL / External Provider
```

Routes should not contain large amounts of business logic.

## 4. Cross-Module Communication

Within the initial modular backend, direct application-service calls are acceptable when ownership is clear.

When asynchronous processing is required, use explicit job/event contracts.

Do not use database-table coupling as a substitute for a module contract.

## 5. Extraction Criteria

A module may become an independent microservice when there is concrete need for:

- independent scaling;
- workload isolation;
- security isolation;
- compute-heavy processing;
- independent deployment cadence;
- provider integration complexity;
- different reliability/SLA requirements;
- asynchronous processing at material volume.

## 6. Likely Future Extraction Candidates

Strong candidates include:

- report-processing workers;
- health-data ingestion/normalisation;
- notifications;
- integration/event delivery;
- recovery/intelligence computation.

These are candidates, not approved deployments.
