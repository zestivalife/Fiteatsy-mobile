# Star Orb release decision register V1

Status: engineering candidate; not production activated. This register does not grant product or clinical approval.

## Dependency graph and real coverage

| Domain/input | Persisted source | Captured today | Loader | Engine | Blocking class |
|---|---|---|---|---|---|
| Activity: steps, active/workout minutes | `health_observations` | Apple Health / Health Connect | yes, 35-day bounded window | 40% steps + 40% exercise + 20% AB-01 | DATA until 14 valid activity/rest days and explicit goals |
| Activity goals | `governed_wellness_goals` | Fitness goal editor for user goals | yes, effective-day history | user precedes Consultant; no display defaults | DATA; Consultant write remains unexposed |
| Sleep: asleep, opportunity, deep, REM, local bed/wake | `health_observations` | Apple Health / Health Connect where supplied | yes | 40% duration + 40% quality + 20% SC-01 | DATA until seven complete nights and explicit sleep goal |
| Sleep goal | `health_profiles.sleep_goal_hours` | existing profile flow | yes | 360–600 minute governed range | DATA |
| Strict Nourishment: consumed protein/hydration | nutrition experience and canonical hydration observations | yes when consumption is recorded | yes | Protein 25% + Hydration 20% | DATA |
| Strict Nourishment: food quality | no approved runtime projection | verified consumed-food proposal only | no | 30% | PRODUCT APPROVAL |
| Strict Nourishment: clinical markers | no approved marker-to-score projection | laboratory records exist separately, not scored | no | 25% | CLINICAL REVIEW and PRODUCT APPROVAL |
| Everyday Nourishment | verified completed consumption, protein and hydration | partially available | proposal deliberately disconnected | equal one-third weights, non-diagnostic | PRODUCT APPROVAL; food dimensions DATA |
| Calm: same-type HRV baseline | `health_observations` | platform dependent | yes | 40% | DATA until 14 same-type baseline days |
| Calm: PSS-10 | `assessment_results` with instrument identity | existing assessment framework | yes | 30%, scale-specific inverse normalisation | PRODUCT APPROVAL / psychological interpretation review |
| Calm: completed mindfulness | canonical completed breathing/focus health events projected as `mindfulness_minutes` | yes | yes | 30% goal attainment | DATA until goal and completed duration exist |
| Mind original: mood | `daily_checkins.mood` | yes | yes | 40% | DATA |
| Mind original: wellbeing | no suitable validated wellbeing repository/instrument | no | explicitly unavailable | 35% | CLINICAL REVIEW / PRODUCT APPROVAL |
| Mind original: completed sessions and stability | canonical session events and seven daily check-ins | yes | yes | 15% + 10% | DATA |
| Self-reported Mind Wellness alternative | genuine mood plus completed sessions and explicit goal | yes when seven days exist | proposal deliberately disconnected | mood 60% + sessions 25% + stability 15% | PRODUCT APPROVAL / psychological interpretation review |
| Recovery: Sleep | candidate Sleep score | conditional | yes | 40% | DATA |
| Recovery: Body | same-type HRV and resting-heart-rate baselines | platform dependent | yes | 30%; HRV and RHR equally weighted within Body | DATA until 14 paired baseline days |
| Recovery: Activity Balance | AB-01 history | conditional | yes | 20% | DATA |
| Recovery: Lifestyle Balance | independent sleep behaviour, activity distribution, mindfulness and explicit lifestyle habits | explicit lifestyle-habit repository absent | fail closed | 10% | ENGINEERING/DATA contract required |
| Seven-day Recovery | seven day-specific Recovery calculations | conditional | yes | preserves null gaps; no carry-forward | blocked wherever a day's Recovery is unavailable |

## Goal revision decision

- Revision writes are serialized per tenant, client, kind and source with a PostgreSQL transaction advisory lock.
- An identical same-day retry is idempotent and returns the existing revision.
- A different same-day value is rejected as ambiguous.
- Backdated revisions before the active revision are rejected; previous scored health days are never silently rewritten.
- A forward revision closes the prior interval on the preceding calendar day.
- The unique active-row constraint remains the database backstop.
- Runtime precedence is USER, then CONSULTANT, then explicit product default. No Consultant mutation endpoint is exposed.

## Formula decisions

| Formula | Version/status | Minimum history | Missing data | Approval |
|---|---|---:|---|---|
| Activity 40/40/20 | Star Orb candidate V1 | 14 days; 28 for high confidence | unavailable | Product approval required |
| Sleep 40/40/20 | Star Orb candidate V1 | 7 nights; 14 for high confidence | unavailable | Product and sleep-threshold review required |
| Strict clinical Nourishment 25/20/30/25 | `STRICT_CLINICAL_NOURISHMENT_V1` | complete day plus validated marker-specific data | unavailable | Clinical and product approval required |
| Everyday Nourishment 1/3 each | `EVERYDAY_NOURISHMENT_V1_PROPOSAL` | one complete consumed day | unavailable | Product approval required; explicitly non-diagnostic |
| Calm 40/30/30 | Star Orb candidate V1 | 14 HRV days | unavailable | Product and psychological interpretation review required |
| Original Mind 40/35/15/10 | Star Orb candidate V1 pending | 7 mood days plus validated instrument | unavailable | Blocked: no approved wellbeing instrument |
| Self-reported Mind 60/25/15 | `SELF_REPORTED_MIND_WELLNESS_V1_PROPOSAL` | 7 mood days | unavailable | Product and psychological interpretation review required; non-diagnostic |
| Recovery 40/30/20/10 | Star Orb candidate V1 | 14 paired body days plus child histories | unavailable | Product/clinical review and lifestyle contract required |

## Production boundary

`candidateValidationEnabled()` rejects the candidate endpoint in production, and the mobile client gate additionally requires `__DEV__`. Migration 0107 is not applied to production. Therefore CI success demonstrates engineering integrity only; it is not product activation, device acceptance or a production-functional numerical Star Orb.

