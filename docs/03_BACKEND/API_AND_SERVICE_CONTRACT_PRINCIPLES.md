# Fiteatsy — API and Service Contract Principles

**Status:** ACTIVE

## API Versioning

Public/backend APIs should remain versioned, currently following the `/v1/...` convention unless a later approved standard replaces it.

## Authentication

User-facing protected APIs require authenticated Fiteatsy sessions.

Trusted service-to-service APIs require a separate workload authentication model when Consultant/Zestiva integration is implemented.

A mobile Bearer token must not masquerade as a trusted backend service identity.

## Ownership

Every object-level API must resolve ownership/authorisation server-side.

Do not trust:

- `x-user-id`;
- body `userId`;
- query `userId`;
- client-provided tenant/owner identifiers

as authorization authority.

## Idempotency

Mutation/sync endpoints that may be retried should support governed idempotency.

This is especially important for:

- health observation ingestion;
- report processing requests;
- event delivery;
- cross-system synchronization;
- subscription/payment workflows later.

## Pagination and Incremental Access

Collection APIs intended for integration should support bounded pagination and, where appropriate:

- updated-since;
- version/cursor;
- stable ordering.

## Error Contract

APIs should distinguish at minimum:

- validation failure;
- unauthenticated;
- unauthorized;
- not found;
- conflict/version failure;
- rate/resource limits;
- transient upstream failure;
- internal failure.

Do not return success when persistence failed.

## Health Data

Health-data responses should preserve relevant provenance and freshness:

- measured_at;
- received_at;
- source;
- last_synced_at where applicable.

## Sensitive Data

Return the minimum fields required for the caller's authorised purpose.
