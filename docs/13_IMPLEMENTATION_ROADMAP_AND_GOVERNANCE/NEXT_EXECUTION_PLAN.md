# Fiteatsy — Next Execution Plan

## Current Recommended Next Step

Do not begin new feature implementation yet.

The next engineering action should be a narrow Railway deployment-readiness audit because Phase 1B code already exists but was not runtime-verified against PostgreSQL.

## Task A — Railway Readiness Audit

Codex should inspect only what is required to answer:

- exact backend build command;
- exact backend start command;
- backend root directory;
- Node version/runtime;
- migration startup behaviour;
- required environment variables;
- current health/readiness/version routes;
- current CORS configuration;
- production/demo fallbacks;
- current database connection assumptions;
- any blocker to Railway deployment.

No implementation in Task A.

## Task B — Minimal Railway Preparation

Using Task A findings, make only the code/config changes required to deploy staging.

## Task C — Create Railway Runtime

Product Owner creates/approves:

- Fiteatsy Railway project;
- staging environment;
- PostgreSQL.

Codex can then configure repository/runtime details where tooling permits.

## Task D — Phase 1B Runtime Verification

Verify migration + auth + persistence + restart + ownership.

Only then classify Phase 1B as `STAGING_VERIFIED`.

## Task E — Fiteatsy Client Phase 1C

After runtime foundation is stable:

- freeze Account → Client cardinality;
- freeze lifecycle;
- implement stable `fiteatsy_client_id`;
- prepare CAP-001 correlation.

## Why This Order

Implementing more domain code before verifying the persistence/runtime foundation would compound uncertainty and increase rework/Codex cost.
