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

## Production Acceptance Record — 30 July 2026

### Status

- deployment status: `PRODUCTION_ACCEPTED`
- acceptance date: `30 July 2026`
- approved by: `Product Owner`

### Deployment Identity

- service: `Fiteatsy Backend`
- production URL: `https://fiteatsy-mobile-production.up.railway.app`
- branch: `main`
- Git SHA: `c79fd4604788808483366394d9729d52727415f1`
- Railway deployment evidence:
  - deployment successful;
  - initialization passed;
  - build passed;
  - deploy passed;
  - post-deploy passed;
  - previous deployment removed;
  - runtime startup evidence: `Fiteatsy backend listening on 8080`

### Runtime Verification Evidence

- `GET /health` returned `200` with service heartbeat
- `GET /ready` returned `200` with `checks.database = "ready"`
- `GET /v1/version` returned:
  - `environment = production`
  - `git_commit = c79fd4604788808483366394d9729d52727415f1`
- `POST /v1/auth/signup/request-otp` no longer exposed `debugOtp` or equivalent OTP/debug secret
- `GET /v1/auth/me` without bearer token returned `401 AUTH_REQUIRED`
- `GET /v1/auth/me` with invalid bearer token returned `401 INVALID_SESSION`
- no unexpected runtime `5xx` responses were observed during the final verification pass

### Migration Packaging Resolution

- Railway build evidence confirmed migration packaging:
  `Copied 1 migration file(s) to /app/dist/db/migrations`
- the previous fatal runtime error no longer recurred:
  `ENOENT /app/dist/db/migrations`
- migration directory packaging is accepted as resolved for this deployment

### Environment / Security Correction

- runtime behavior was corrected from staging semantics to production semantics
- public OTP debug exposure was removed after the production environment correction

### Known Verification Limitations

- full migration-ledger inspection was not independently performed through the public API
- full schema-object inspection was not independently performed through the public API
- migration execution/recording beyond runtime readiness and authenticated database-path evidence was not directly exposed by the public API

## Freeze Rule

Stop further production rollout if:

- runtime commit differs;
- migrations mismatch;
- health/readiness fails;
- ownership/security regression appears;
- unknown runtime behaviour remains unexplained.
