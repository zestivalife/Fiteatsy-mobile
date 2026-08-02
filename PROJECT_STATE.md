# Fiteatsy — Project State

**Last Updated:** 2 August 2026
**Status:** M3B.2_IMPLEMENTED_PENDING_VERIFICATION
**Approved By:** Product Owner

## Current Production Runtime

- Service: Fiteatsy Backend
- Production URL: `https://fiteatsy-mobile-production.up.railway.app`
- Branch: `main`
- Running Git commit: `49c2276dd1bd46b428eea37885961895806c672d`
- Deployment status: Railway production deployment verified and accepted

## M3A Milestone Status

- Milestone: `M3A — Client Identity Foundation`
- Milestone status: `PRODUCTION_ACCEPTED`
- Acceptance date: `30 July 2026`
- Railway deployment: `a0db3b89`

## M3B Definition Status

- Milestone: `M3B — Existing Domain Ownership Transition`
- Definition status: `ARCHITECTURE APPROVED`
- Scope type: `Governance approved; phased implementation`
- Accepted slice: `M3B.1 ONLY`
- Implemented slice pending verification: `M3B.2 — Repository & Authorization Transition`
- Review package: `docs/02_IDENTITY_AND_CLIENT/M3B_EXISTING_DOMAIN_OWNERSHIP_TRANSITION_REVIEW.md`

## M3B.1 Status

- Slice: `M3B.1 — Ownership Schema Foundation`
- Implementation status: `PRODUCTION_ACCEPTED`
- Acceptance date: `1 August 2026`
- Railway deployment: `728a9f03`
- Authorized scope: `Schema foundation only`
- Explicitly not authorized: `M3B.3`, `M3B.4`, `M3C`

## M3B.2 Status

- Slice: `M3B.2 — Repository & Authorization Transition`
- Implementation status: `IMPLEMENTED_PENDING_VERIFICATION`
- Implementation date: `2 August 2026`
- Authorized scope: `Repository/service/API authorization transition for M3B.1 direct-root persisted surfaces`
- Direct-root tables now used by runtime ownership checks: `health_profiles`, `care_cases`, `nutrition_profiles`, `notifications`
- Canonical runtime ownership: authenticated bearer token -> account -> server-resolved current client -> `resource.client_id`
- Public API contract: unchanged; internal `client_id` is not exposed in platform response DTOs
- Cross-client care-case object access: fail closed with `403 CARE_CASE_FORBIDDEN`
- Reports persistence remains temporary/in-memory and account-keyed pending `M3B.3`; only report-to-platform side effects now pass server-derived current-client ownership into platform persistence
- Verification status: TypeScript compile, backend build, migration packaging, and DB-independent migration contract tests passed; DB-backed API/repository/service tests are pending because local PostgreSQL was unavailable (`ECONNREFUSED`)

## Acceptance Evidence

- Runtime environment verified as `production`
- `GET /health` returned `200`
- `GET /ready` returned `200` with `checks.database = "ready"`
- `GET /v1/version` returned Git commit `49c2276dd1bd46b428eea37885961895806c672d`
- Railway build packaged all accepted production migrations:
  `Copied 3 migration file(s) to /app/dist/db/migrations`
- Direct production migration ledger evidence confirmed:
  - `0001_phase1b_persistence_foundation.sql`
  - `0002_m3a_client_identity_foundation.sql`
  - `0002` applied at `2026-07-30 21:02:56`
  - `0003_m3b1_ownership_schema_foundation.sql`
  - `0003` applied at `2026-07-31 10:47:25`
- Direct production schema evidence confirmed `client_id` is present in the four authoritative M3B.1 direct-root tables:
  - `health_profiles`
  - `care_cases`
  - `nutrition_profiles`
  - `notifications`
- Direct production data evidence confirmed:
  - `users` row count = `0`
  - `fiteatsy_clients` row count = `0`
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
- Earlier M3B.1 startup failure caused by `daily_checkins` schema drift is resolved
- Corrected migration `0003` now operates only on persisted direct-root tables that exist in the production migration chain

## Evidence Classification

Observed Evidence:

- production runtime serves commit `49c2276dd1bd46b428eea37885961895806c672d`
- migration `0002_m3a_client_identity_foundation.sql` is recorded in production `schema_migrations`
- migration `0003_m3b1_ownership_schema_foundation.sql` is recorded in production `schema_migrations`
- production table `fiteatsy_clients` exists with the expected visible columns
- production direct-root ownership tables `health_profiles`, `care_cases`, `nutrition_profiles`, and `notifications` expose `client_id`
- current production dataset contains `0` users and `0` clients

Inference:

- migration `0002` was discovered and executed successfully because it appears in the production migration ledger
- migration `0003` was packaged, discovered, executed, and recorded because it appears in the production migration ledger with an applied timestamp
- current zero-account production dataset required zero populated ownership-transition rows

Unverified / Deferred Runtime Evidence:

- full production constraint/index metadata for all M3B.1 ownership surfaces was not independently runtime-inspected during close-out
- populated production evidence for a real account -> client pair still does not exist
- populated ownership-transition behavior remains deferred until production contains applicable rows
- deferred persistence/ownership surfaces were not migrated in M3B.1 because they are not present in the deployed `0001 + 0002` baseline: `daily_checkins`, `ai_decision_logs`, `nudges`, `lab_reports`, `attachments`

## Next Governed Milestone

- Milestone: `M3 — Fiteatsy Client & Identity`
- Current milestone state: `M3B.2 IMPLEMENTED_PENDING_VERIFICATION`
- Next candidate status: `M3B.2 — DB-BACKED REGRESSION AND PRODUCTION VERIFICATION REQUIRED`

## Next Governance Gate

The next gate is:

`M3B.2 — Verification / Production Acceptance`

Approved M3 decisions now on record:

- `1 Account : 1 Client` for the M3 implementation model
- Client is created deterministically after successful account verification
- Client existence is separate from product activation/onboarding completion
- `fiteatsy_client_id` is the stable external/domain identifier
- Internal database IDs remain private
- CAP-001 correlation remains separate from Fiteatsy client identity
- Professional access remains outside `M3A`
- direct client ownership cutover is approved now, before meaningful production domain data accumulates
- direct client-owned aggregate roots use canonical internal `client_id -> fiteatsy_clients.id`
- client deactivation retains historical domain data
- destructive cascading deletion from Client into longitudinal health data is prohibited
- partial migration states must fail closed rather than broaden authorization

Before `M3B.3+`, Product Owner decisions still remain relevant for later slices, but are not authorization to begin them:

- CAP-001 reference naming
- later deactivation UX/reactivation workflow
- later retention/anonymisation policy detail beyond the non-destructive baseline
