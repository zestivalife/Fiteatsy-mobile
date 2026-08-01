# Fiteatsy — Current Programme State

**Baseline Date:** 1 August 2026

## Repository

Known Fiteatsy repository:

`/Users/l.paunikar/Desktop/fiteatsy-mobile`

Known remote:

`https://github.com/zestivalife/Fiteatsy-mobile.git`

Branch observed during prior audit: `main`.

Repository/runtime facts must be re-verified at execution time.

## Completed / Established

- actual Fiteatsy repository identified;
- Expo/React Native mobile architecture identified;
- Node/Express/TypeScript backend identified;
- PostgreSQL target identified;
- Phase 1B persistence/auth implementation reported;
- architecture documentation rebuilt;
- Consultant integration boundary defined;
- Railway target architecture defined;
- security and delivery governance defined;
- Railway production deployment verified;
- Railway production deployment accepted by Product Owner.

## Accepted Runtime State

- service: `Fiteatsy Backend`
- production URL: `https://fiteatsy-mobile-production.up.railway.app`
- branch: `main`
- running Git commit: `49c2276dd1bd46b428eea37885961895806c672d`
- runtime environment verified as `production`
- `/health` verified
- `/ready` verified with PostgreSQL ready
- public OTP debug exposure removed
- authentication guards verified
- direct production migration ledger now includes `0002_m3a_client_identity_foundation.sql`
- direct production migration ledger now includes `0003_m3b1_ownership_schema_foundation.sql`
- direct production schema evidence confirms `client_id` in `health_profiles`, `care_cases`, `nutrition_profiles`, and `notifications`
- direct production data evidence shows `users = 0` and `fiteatsy_clients = 0`
- Railway deployment `728a9f03` is the accepted M3B.1 production deployment

## Next Governed Milestone

- milestone: `M3 — Fiteatsy Client & Identity`
- current state: `M3B.1 PRODUCTION_ACCEPTED`
- next candidate status: `M3B.2 — REPOSITORY AND AUTHORIZATION TRANSITION DEFINITION / READINESS REVIEW REQUIRED`

## Known Runtime Limitation

Production currently contains zero users and zero clients, so populated live evidence for real account -> client mappings, live uniqueness behavior, and real client lifecycle states remains deferred rather than blocked.

M3B.1 also intentionally deferred ownership/persistence surfaces that are not present in the deployed `0001 + 0002` migration baseline: `daily_checkins`, `ai_decision_logs`, `nudges`, `lab_reports`, and `attachments`.

## Immediate Next State

```text
CURRENT
  |
  v
Production Accepted Backend Baseline
  |
  v
M3 Definition Approved
  |
  v
M3A — Client Identity Foundation
  |
  v
Production Accepted
  |
  v
M3B Architecture Approved
  |
  v
M3B.1 Production Accepted
  |
  v
M3B.2 Definition / Readiness Review Required
```

## Do Not Skip Ahead

Do not begin `M3B.2`, `M3B.3`, `M3B.4`, or `M3C` until a separate explicit instruction establishes scope, gate, acceptance criteria, and protected-baseline regression requirements.
