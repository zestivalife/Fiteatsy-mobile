# Star Orb Candidate Runtime Adapters V1

Status: `ISOLATED_VALIDATION_ONLY`  
Methodology: `FITEATSY_STAR_ORB_V1@1.0.0-candidate.1`  
Production route: none

The candidate runtime consumes repository-shaped canonical records and executes the same shared candidate engine used by golden fixtures. It is intentionally not imported by an Express route, production score calculation, mobile API client, or Home state. This prevents an unapproved candidate number from becoming an approved production score.

## Mapping

| Domain | Runtime source | Adapter rule |
|---|---|---|
| Activity | canonical `steps`, `active_minutes`, `workout_minutes`; governed goals | Canonical daily aggregates select authoritative sources and deduplicate stable source identities. `active_minutes` is preferred; workout minutes are fallback, never added to it. Fourteen daily goal-relative loads feed AB-01. Prior-night governed sleep attainment supplies the independent rest input. |
| Sleep | canonical sleep sessions and Deep/REM records; governed sleep target | Sessions require start/end boundaries and are assigned to the local wake day. Seven bedtime/wake pairs are mapped in local clock minutes. Asleep minutes and stage minutes remain distinct. |
| Nourishment | complete food-day projection, canonical hydration, diet goals, approved marker-specific evaluations | Incomplete diary days are absent, not zero. Protein and hydration use governed targets. Clinical input accepts only already-approved marker-specific scores; the adapter performs no generic laboratory interpretation. |
| Calm | canonical SDNN or RMSSD series, validated PSS-10, canonical mindfulness, governed goal | SDNN is preferred only when present for that day; otherwise RMSSD is selected. The baseline uses the same selected type only. No conversion is performed. |
| Mind | explicit mood check-ins, validated wellbeing assessment, completed sessions, self-report history | Mood is mapped from its declared 1–5 scale. No wearable observation enters Mind. |
| Recovery | calculated candidate Sleep, AB-01, same-type HRV/RHR baselines, verified behaviour components | Recovery never consumes Overall Health Intelligence. The adapter passes independent component results once, avoiding circular calculation. |
| Seven-day trend | seven separately adapted calendar health days | Every day resolves its own goals and prior baseline window. Duplicate or non-consecutive days are rejected and null results remain gaps. |

## Governance and diagnostics

Every result carries candidate activation, methodology ID/version, health day, calculation timestamp, freshness, confidence, used/missing input keys, factors, and an explanation. These fields are privacy-safe: record values and personal identifiers are not logged.

Production Home continues to consume `canonicalIntelligence.scores.activity`, `.sleep`, `.nutrition`, `.calm`, `.mind`, and `.recovery`. The candidate adapter cannot replace those values until a separately authorised activation changes the production methodology registry and API contract.

## Recalculation and persistence boundary

Migration 0106 already provides `(client, account, score type, methodology version, health day)` idempotency. Candidate validation does not write to `health_scores`, because that table is production-readable. After approval, a dedicated activation must map candidate status to the production contract, retain methodology version, calculate only affected health days, and invalidate the matching mobile cache generation. No such activation is part of this candidate integration.
