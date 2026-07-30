# Fiteatsy — Deployment Verification & Acceptance

## Deployment States

Use explicit states:

```text
PLANNED
IMPLEMENTED
LOCALLY_VERIFIED
DEPLOYED
RUNTIME_VERIFIED
PRODUCTION_ACCEPTED
BLOCKED
```

A successful build is not `PRODUCTION_ACCEPTED`.

## Staging Verification

At minimum verify:

- expected Git commit deployed;
- API starts;
- health endpoint;
- readiness endpoint;
- version endpoint;
- PostgreSQL connectivity;
- expected migration applied;
- authentication flow;
- protected API rejects unauthenticated access;
- authenticated ownership;
- critical persisted write/read;
- restart persistence.

## Mobile Verification

Verify a staging mobile build/device can:

- reach Railway API;
- authenticate;
- restore session;
- perform approved persisted operations;
- handle API unavailability clearly.

## Production Acceptance Evidence

Record:

- branch;
- Git SHA;
- Railway deployment ID;
- environment;
- database/migration version;
- health response;
- readiness response;
- version response;
- authentication evidence;
- representative API evidence;
- regression result;
- known limitations.

## Freeze Rule

Stop further production rollout if:

- runtime commit differs;
- migrations mismatch;
- health/readiness fails;
- ownership/security regression appears;
- unknown runtime behaviour remains unexplained.
