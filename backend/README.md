# Fiteatsy Backend Foundation

Production-oriented Node.js + PostgreSQL scaffold for:

- Account + session-backed onboarding/profile storage
- Daily check-ins
- Intelligence decisions (single priority + burnout flag + one nudge)
- Nudge policy guardrails
- Decision logging
- Shared health-profile / nutrition-profile / care-case platform foundation

## API Summary

- `GET /health`
- `GET /ready`
- `GET /v1/version`
- `POST /v1/checkins`
- `GET /v1/auth/me`
- `POST /v1/auth/logout`
- `POST /v1/intelligence/priority`
- `POST /v1/nudges/dispatch-check`
- `GET /v1/platform/health-profile`
- `PATCH /v1/platform/health-profile`
- `GET /v1/platform/health-profile/completion`
- `POST /v1/platform/health-profile/request-missing-information`
- `GET /v1/platform/care-cases/current`
- `POST /v1/platform/care-cases/:careCaseId/assign-consultant`
- `GET /v1/platform/care-cases/:careCaseId/timeline`
- `GET /v1/platform/care-cases/:careCaseId/events`
- `GET /v1/platform/care-cases/:careCaseId/tickets`
- `GET /v1/platform/notifications`
- `POST /v1/reports/analyze`

Protected routes under `/v1/platform/*`, `/v1/reports/*`, and authenticated wearable endpoints now require:

`Authorization: Bearer <opaque session token>`

Server-side ownership comes from the authenticated account context and no longer trusts `x-user-id`, body `userId`, query `userId`, `demo-user`, or `emp-demo-1`.

## Database / Migrations

- Authoritative schema evolution now lives in `backend/src/db/migrations/*.sql`
- Reference schema lives in `backend/src/db/schema.sql`
- Run migrations with `backend/package.json` script: `db:migrate`
- Backend startup runs migrations automatically before listening for traffic.
- Migration execution is serialized with a PostgreSQL advisory lock so concurrent staging instances do not race schema updates.

## Runtime Environment

### Railway-provided

- `PORT`
- `DATABASE_URL` when Railway PostgreSQL is attached

### Application-required for staging / production

- `DATABASE_URL`

### Application-optional

- `NODE_ENV`
- `OTP_DEBUG_RESPONSE_ENABLED`
- `GIT_COMMIT`
- `RAILWAY_GIT_COMMIT_SHA`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

### Environment Notes

- Local development may fall back to `postgres://postgres:postgres@localhost:5432/nuetra` when `DATABASE_URL` is not set and the runtime is not staging/production.
- Staging and production startup fail fast if `DATABASE_URL` is missing.
- `OTP_DEBUG_RESPONSE_ENABLED=true` only exposes `debugOtp` outside production. Production never returns `debugOtp`.
- `GET /v1/version` returns `service`, `version`, `environment`, and `git_commit`.
- `GET /ready` checks PostgreSQL readiness and returns `200` when ready or `503` when not ready.
- Current CORS remains the default permissive mobile-staging setup and should be hardened before production.

## Phase 1 Foundation

See `PLATFORM_FOUNDATION_PHASE1.md` for the new shared care-case architecture, lifecycle, calculation engine, and report pipeline integration.

## AI Prompt Contract

System prompt used by intelligence worker:

"You are a compassionate health intelligence engine. You analyze user behavior, patterns, and calendar data. Generate:
1. One actionable priority
2. Burnout risk flag (none/watch/alert)
3. One nudge with timing
Be human, warm, and never preachy. Never suggest more than one action."

## Privacy Principles

- Encrypt at rest (DB) and in transit (TLS)
- Employer analytics must be aggregated only
- One-tap delete endpoint should permanently remove user data
- No personal data selling

## Scope Boundaries

### Implemented

- Durable account persistence
- Durable session persistence
- Durable health profile and care case ownership foundation

### Planned

- Consultant synchronization
- Report file storage persistence
- Wearable storage persistence

### Blocked

- External `fiteatsy_client_id` finalization
- Account to client cardinality decisions
