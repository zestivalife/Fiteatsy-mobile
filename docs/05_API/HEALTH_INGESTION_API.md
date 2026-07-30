# Fiteatsy — Health Ingestion API

**Status:** TARGET CONTRACT

## Purpose

Accept health observations from Fiteatsy mobile and approved integrations without creating duplicates or losing provenance.

## Conceptual Endpoint

A future contract may resemble:

```text
POST /v1/health/observations:batch
```

The exact route is not frozen.

## Batch Request Requirements

A batch should identify:

- source/provider;
- source synchronization context;
- observations;
- source record IDs where available;
- measured timestamps;
- metric types;
- values/units;
- idempotency/sync key.

## Server Responsibilities

The server must:

1. authenticate the caller;
2. resolve the Fiteatsy client;
3. validate supported metrics;
4. validate units/data shape;
5. deduplicate/idempotently process;
6. preserve source provenance;
7. persist accepted observations;
8. return acknowledgement/checkpoint information.

## Response

The response should distinguish:

- accepted;
- duplicate/already processed;
- rejected;
- invalid;
- retryable failure.

## Checkpoints

The server acknowledgement should allow the mobile client to safely advance its local sync checkpoint.

Failed batches must not cause the device to permanently skip unsynchronised records.

## Historical Backfill

Initial health-source connection may require historical ingestion.

Backfill must be bounded and resumable rather than a single uncontrolled request.

## Security

The caller cannot provide an arbitrary `client_id` to write another user's observations.

Trusted provider/server ingestion, if introduced later, uses a different service identity.
