# Nuetra Backend Foundation

Production-oriented Node.js + PostgreSQL scaffold for:

- Onboarding + profile storage
- Daily check-ins
- Intelligence decisions (single priority + burnout flag + one nudge)
- Nudge policy guardrails
- Decision logging

## API Summary

- `POST /v1/checkins`
- `POST /v1/intelligence/priority`
- `POST /v1/nudges/dispatch-check`

## SQL Schema

Apply `/src/db/schema.sql` in PostgreSQL.

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
