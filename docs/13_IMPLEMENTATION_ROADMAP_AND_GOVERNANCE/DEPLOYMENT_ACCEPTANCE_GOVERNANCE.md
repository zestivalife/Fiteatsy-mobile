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

## Latest Accepted Production Runtime

### 30 July 2026

- status: `PRODUCTION_ACCEPTED`
- approved by: `Product Owner`
- service: `Fiteatsy Backend`
- production URL: `https://fiteatsy-mobile-production.up.railway.app`
- branch: `main`
- Git SHA: `c79fd4604788808483366394d9729d52727415f1`
- environment verified as `production`
- Railway deployment passed build/deploy/post-deploy checks
- health/readiness/database evidence passed
- OTP debug exposure was removed before acceptance
- limitation retained: migration ledger and full schema inspection were not independently exposed through the public API
