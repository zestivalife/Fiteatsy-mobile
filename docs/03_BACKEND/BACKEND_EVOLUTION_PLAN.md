# Fiteatsy — Backend Evolution Plan

**Status:** ROADMAP GUARD

## Stage 1 — Persistence Foundation

Current Phase 1B direction:

- PostgreSQL foundation;
- migrations;
- durable account/session;
- authenticated ownership;
- persisted profile/care foundation.

Required closure: Railway staging runtime verification.

## Stage 2 — Client Domain

Phase 1C:

- approve Account → Client model;
- introduce `fiteatsy_client_id`;
- client lifecycle;
- CAP-001 correlation contract preparation.

## Stage 3 — Health Data Foundation

- canonical health observation model;
- device synchronization contract;
- deduplication/idempotency;
- longitudinal storage;
- freshness/provenance.

## Stage 4 — Medical Records & Biomarkers

- private object storage;
- report lifecycle;
- extraction pipeline;
- biomarker normalisation/history;
- longitudinal comparison.

## Stage 5 — Recovery / Progress

- approved scoring methodology;
- deterministic computation;
- history;
- user/practitioner presentation.

## Stage 6 — Consultant Integration

- ProductClientProjection;
- CAP-003 access boundary;
- trusted query APIs;
- initial backfill;
- incremental sync;
- reconciliation.

## Stage 7 — Service Extraction Where Needed

Only extract independently deployable services when operational evidence justifies it.

## Guard

Do not jump directly to Stage 6 simply because Consultant sync is a product requirement. Stable client identity and authoritative health data must exist first.
