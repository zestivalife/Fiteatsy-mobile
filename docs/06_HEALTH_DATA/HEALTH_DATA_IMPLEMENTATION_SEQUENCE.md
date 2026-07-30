# Fiteatsy — Health Data Implementation Sequence

## H0 — Runtime Foundation

Before expanding health ingestion:

- deploy backend;
- deploy PostgreSQL;
- verify migrations;
- verify auth/session;
- establish staging runtime evidence.

## H1 — Client Identity

Complete Phase 1C:

- Fiteatsy Client;
- stable external client reference;
- ownership mapping.

## H2 — Metric Registry

Approve initial launch metrics and canonical units.

Do not implement an unlimited arbitrary metric store first.

## H3 — Canonical Observation Persistence

Implement:

- observation schema;
- source/provenance;
- timestamps;
- indexes;
- version/migration;
- tests.

## H4 — Mobile Sync Contract

Implement:

- batching;
- checkpoints;
- retry;
- idempotency;
- deduplication;
- authentication.

Start with the health sources already supported by the mobile code before adding new providers.

## H5 — Longitudinal Queries

Implement:

- latest value;
- history;
- bounded trends/aggregates;
- freshness.

## H6 — Consultant Consumption

Only after CAP-003 and cross-system identity contracts exist:

- projection;
- trusted health APIs;
- freshness;
- authorization tests.

## H7 — Additional Providers

Add cloud/provider integrations individually through documented adapters.

## H8 — Recovery Intelligence

Only after stable health inputs and an approved scoring methodology exist.

## Credit / Engineering Efficiency Rule

Do not ask Codex to implement all health providers, all metrics and Consultant sync in one task.

Each stage should have a narrow acceptance contract and reuse these documents instead of re-auditing the full product architecture.
