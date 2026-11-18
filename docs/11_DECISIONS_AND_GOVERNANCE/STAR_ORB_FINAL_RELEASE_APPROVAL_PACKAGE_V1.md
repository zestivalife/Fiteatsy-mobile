# Star Orb final release approval package V1

Status: engineering candidate; production activation prohibited pending the decisions below.

## Interpretation boundary

Every score is a non-diagnostic product wellness indicator from explicitly identified inputs. It does not diagnose disease, mental illness, fitness, readiness or medical risk. Missing applicable data remains `null`; it is never replaced by zero, an inferred behaviour or a prescribed plan.

## Candidate formulas

| Domain | Formula | Minimum input | Missing-data rule | Approval |
|---|---|---|---|---|
| Activity | steps attainment 40% + exercise-minutes attainment 40% + AB-01 balance 20% | current steps/exercise, explicit goals, 14 activity days and 7 recovery/rest days | null if any applicable child is absent | Product methodology approval |
| Sleep | duration 40% + efficiency/quality 40% + consistency 20% | seven sleep sessions and explicit 360–600 minute goal | null when the seven-night window or goal is incomplete | Product methodology approval; clinical review only for health claims |
| Calm | same-type HRV baseline 40% + validated PSS-10 30% + mindfulness-goal attainment 30% | 28 same-type HRV days, same-day PSS-10, explicit mindfulness goal and minutes | null; SDNN and RMSSD never mix | Product approval plus psychological review for interpretation of PSS-10 |
| Strict Nourishment | protein 25% + hydration 20% + food quality 30% + approved clinical markers 25% | complete verified consumption and approved marker-specific scores | null; weights are not redistributed | Clinical/product approval |
| Everyday Nourishment proposal | protein 1/3 + hydration 1/3 + food quality 1/3 | explicit protein/hydration goals, complete consumed-food diary, verified foods, food group, fibre and added sugar | null if nutrient metadata is absent; plans are not consumption | Product approval; no clinical claim |
| Original Mind | mood 30% + validated wellbeing instrument 25% + completed sessions 20% + seven-day emotional history 25% | validated wellbeing scale, genuine check-ins/sessions and explicit goal | null without the approved instrument | Psychological/product methodology approval |
| Self-Reported Mind Wellness proposal | seven-day mood mean 60% + seven-day session-goal attainment 25% + mood stability 15% | one explicit 1–5 mood check-in per day for seven days, completed sessions, explicit weekly goal | null when a day is missing; no reverse scoring because this is not a multi-item instrument | Product approval and psychological wording review |
| Recovery | Sleep 40% + Body 30% + Activity Balance 20% + independent Lifestyle Balance 10% | calculated Sleep, 14+ same-type HRV/RHR baseline, AB-01 history, all four explicit lifestyle entries | null when any child is missing | Product methodology approval |

Body Recovery is the mean of personal-baseline HRV and inverse resting-heart-rate candidates. Lifestyle Balance is only the mean of four explicitly recorded binary entries (Yes=100, No=0): consistent daily routine, recovery/rest practice, evening screen boundary and outdoor/daylight routine. An omitted answer is missing—not No. Sleep, activity and mindfulness are not included in Lifestyle Balance, preventing circularity and double counting.

## Persistence and provenance

Lifestyle entries use the established tenant-owned `health_events` contract with `LIFESTYLE_BALANCE_V1_PROPOSAL`. Each event carries authenticated user/care-case ownership, habit type, health day, explicit completion, revision, record status, mobile Tracker provenance and event timestamps. Existing replay keys provide idempotency; the identity-scoped mobile queue provides offline/restart/reauthentication replay. A later higher revision wins per habit/day. A revocation event removes that habit from eligibility, making the day incomplete.

Everyday Nourishment reads only actual Nutrition consumption events. It must not use scheduled or prescribed meals. Current production consumption projections expose protein, hydration and fibre but do not yet guarantee verified food group and added-sugar metadata for every consumed item. Therefore the proposal correctly remains unavailable for those records until that canonical metadata contract is completed.

Self-Reported Mind Wellness reads daily check-ins and completed wellness-session health events. It is separate from the original Mind score and is never labelled clinically validated.

## Versioning, activation and rollback

- Candidate scoring: isolated validation gate only.
- Lifestyle contract: `LIFESTYLE_BALANCE_V1_PROPOSAL`.
- Everyday Nourishment: `EVERYDAY_NOURISHMENT_V1_PROPOSAL`.
- Mind Wellness: `SELF_REPORTED_MIND_WELLNESS_V1_PROPOSAL`.
- Production rollback is feature-gate disablement; raw observations and lifestyle events remain intact.
- No score proposal may replace existing production semantics without an approved versioned activation decision.

## Decisions engineering cannot make

1. Approval of the four qualifying lifestyle behaviours and binary scoring.
2. Approval of all thresholds and weights above.
3. Canonical verified food-group and added-sugar capture for consumed foods.
4. Approval of Everyday Nourishment wording and one-third weights.
5. Approval of Mind Wellness wording, 60/25/15 weights and missing-check-in policy.
6. Selection and licensing/validation of an original Mind wellbeing instrument.
7. User-facing interpretation bands and whether any statement requires professional clinical or psychological review.
