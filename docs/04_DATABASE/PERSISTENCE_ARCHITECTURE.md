# Fiteatsy — Persistence Architecture

## Principles

1. PostgreSQL is authoritative for structured backend-owned state.
2. Mobile AsyncStorage is cache/local UX state, not competing truth.
3. Medical-report binaries belong in private object storage.
4. Cross-system integration uses APIs/events/projections, not shared tables.
5. Longitudinal health data preserves provenance and timestamps.
6. Mutations requiring retries must support idempotency.
7. Sensitive records require ownership and audit controls.
8. Soft deletion must not be confused with anonymisation or legal deletion.

## Logical Persistence

```text
PostgreSQL
|
+-- Identity / Account
+-- Client
+-- Health Profile
+-- Health Observations
+-- Reports Metadata
+-- Biomarkers
+-- Medication
+-- Recovery / Progress
+-- Notification State
+-- Integration / Outbox
+-- Audit / Reconciliation

Private Object Storage
|
+-- Medical / Lab Report Files
```

## Database Isolation

Fiteatsy should use its own PostgreSQL service/database.

Do not reuse the Nuetra/Consultant database merely because all services are hosted on Railway.

## Transaction Boundaries

Operations that must remain internally consistent should use database transactions.

External side effects should generally occur after durable local persistence, using an outbox/job pattern where appropriate.
