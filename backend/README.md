# Nuetra Backend Foundation

Production-oriented Node.js + PostgreSQL scaffold for:

- Onboarding + profile storage
- Daily check-ins
- Intelligence decisions (single priority + burnout flag + one nudge)
- Nudge policy guardrails
- Decision logging
- Shared health-profile / nutrition-profile / care-case platform foundation

## API Summary

- `POST /v1/checkins`
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

## SQL Schema

Apply `/src/db/schema.sql` in PostgreSQL.

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
