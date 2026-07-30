# Fiteatsy — API Versioning, Idempotency & Errors

## Versioning

Current convention uses `/v1`.

Breaking contract changes should not silently alter existing mobile behaviour.

## Idempotency

Required or strongly recommended for retry-sensitive operations:

- health batch ingestion;
- report registration/processing initiation;
- integration mutations;
- event delivery;
- future payment/subscription operations.

## Concurrency

Versioned resources may use optimistic concurrency where lost updates are a risk.

## Pagination

Large collections require bounded pagination.

Cursor-based pagination is preferred where data changes frequently and stable ordering matters.

## Error Model

A standard error envelope should eventually include:

- stable error code;
- human-safe message;
- correlation/request ID;
- field validation details where appropriate;
- retryability where useful.

## HTTP Semantics

Use meaningful status classes:

- 2xx success;
- 400 validation;
- 401 unauthenticated;
- 403 unauthorized;
- 404 not found;
- 409 conflict/idempotency/version conflict;
- 413 payload too large where relevant;
- 429 rate limited;
- 5xx server/upstream failure.

## Health Information

Do not hide failed health synchronization behind a successful empty response.
