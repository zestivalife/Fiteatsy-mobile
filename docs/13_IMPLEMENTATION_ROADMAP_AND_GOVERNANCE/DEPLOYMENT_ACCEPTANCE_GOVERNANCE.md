# Fiteatsy — Deployment Acceptance Governance

## Deployment Evidence

Every meaningful staging/production verification should identify:

- repository;
- branch;
- Git SHA;
- environment;
- deployment ID;
- migration version;
- health result;
- readiness result;
- version result;
- representative API result;
- relevant mobile/device result;
- regression result.

## Staging

Staging is the first real integration gate for Railway/PostgreSQL.

Do not use production as the first place to discover migration/runtime failures.

## Production

Production acceptance is explicit.

```text
Build Successful
      ↓
Deployment Successful
      ↓
Runtime Verified
      ↓
Security/Regression Verified
      ↓
Production Accepted
```

## Runtime Mismatch

Freeze progression if deployed runtime does not match expected source/migration state.
