# Fiteatsy — Project State

**Last Updated:** 30 July 2026  
**Status:** PRODUCTION_ACCEPTED  
**Approved By:** Product Owner

## Current Production Runtime

- Service: Fiteatsy Backend
- Production URL: `https://fiteatsy-mobile-production.up.railway.app`
- Branch: `main`
- Running Git commit: `141f405d38e8f93b663c84288f76ba59348f4a09`
- Deployment status: Railway production deployment verified and accepted

## M3A Milestone Status

- Milestone: `M3A — Client Identity Foundation`
- Milestone status: `PRODUCTION_ACCEPTED`
- Acceptance date: `30 July 2026`
- Railway deployment: `a0db3b89`

## Acceptance Evidence

- Runtime environment verified as `production`
- `GET /health` returned `200`
- `GET /ready` returned `200` with `checks.database = "ready"`
- `GET /v1/version` returned Git commit `141f405d38e8f93b663c84288f76ba59348f4a09`
- Railway build packaged both production migrations:
  `Copied 2 migration file(s) to /app/dist/db/migrations`
- Direct production migration ledger evidence confirmed:
  - `0001_phase1b_persistence_foundation.sql`
  - `0002_m3a_client_identity_foundation.sql`
  - `0002` applied at `2026-07-30 21:02:56`
- Direct production schema evidence confirmed table `fiteatsy_clients` exists with visible columns:
  - `id`
  - `fiteatsy_client_id`
  - `account_user_id`
  - `status`
  - `version`
  - `created_at`
  - `updated_at`
  - `deleted_at`
- Direct production data evidence confirmed:
  - `users` row count = `0`
  - `fiteatsy_clients` row count = `0`
  - eligible backfill count = `0`
  - observed backfill result = `0`
- OTP debug exposure removed from public `POST /v1/auth/signup/request-otp`
- Authentication guards verified:
  - `/v1/auth/me` without bearer token -> `401 AUTH_REQUIRED`
  - `/v1/auth/me` with invalid bearer token -> `401 INVALID_SESSION`
- Invalid OTP verification returned `401 OTP_INVALID`
- No unexpected runtime `5xx` responses were observed in the final production verification pass

## Accepted Corrections

- Railway runtime environment corrected from staging semantics to production semantics
- Public OTP debug exposure removed after production environment correction
- Production runtime now reports the expected environment and commit identity

## Evidence Classification

Observed Evidence:

- production runtime serves commit `141f405d38e8f93b663c84288f76ba59348f4a09`
- migration `0002_m3a_client_identity_foundation.sql` is recorded in production `schema_migrations`
- production table `fiteatsy_clients` exists with the expected visible columns
- current production dataset contains `0` users and `0` clients

Inference:

- migration `0002` was discovered and executed successfully because it appears in the production migration ledger
- current zero-account production dataset required zero backfill rows

Unverified / Deferred Runtime Evidence:

- production constraint/index metadata for `fiteatsy_clients` was not independently runtime-inspected
- populated production evidence for a real account -> client pair does not yet exist
- populated production evidence for live `1:1` mappings, public-ID uniqueness, and real client lifecycle states remains deferred until production data exists

## Next Governed Milestone

- Milestone: `M3 — Fiteatsy Client & Identity`
- Current milestone state: `M3A PRODUCTION ACCEPTED`
- Next candidate status: `M3B — EXISTING DOMAIN OWNERSHIP TRANSITION NOT YET AUTHORIZED`

## Next Governance Gate

The next gate is:

`M3B — Existing Domain Ownership Transition Definition / Architecture Review`

Approved M3 decisions now on record:

- `1 Account : 1 Client` for the M3 implementation model
- Client is created deterministically after successful account verification
- Client existence is separate from product activation/onboarding completion
- `fiteatsy_client_id` is the stable external/domain identifier
- Internal database IDs remain private
- CAP-001 correlation remains separate from Fiteatsy client identity
- Professional access remains outside `M3A`

Before `M3B`, Product Owner decisions are still required for:

- ownership cutover scope across `user_id`-owned health-domain records
- backward-compatibility window for mixed account/client ownership
- authorization and IDOR controls during transitional reads/writes
- rollback expectations for ownership migration failure
- CAP-001 and deactivation semantics that may affect downstream ownership contracts
