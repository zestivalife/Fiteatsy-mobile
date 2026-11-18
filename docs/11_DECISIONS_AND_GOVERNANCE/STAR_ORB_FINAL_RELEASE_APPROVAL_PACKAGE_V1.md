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
| Original Mind | **Executable candidate:** mood 40% + validated wellbeing instrument 35% + completed sessions 15% + seven-day emotional history 10%. **Unapproved documentary alternative:** 30% / 25% / 20% / 25% | validated wellbeing scale, genuine check-ins/sessions and explicit goal | null without the approved instrument | Product must decide whether to retain the executable formula or approve a new version; no silent formula change is authorised |
| Self-Reported Mind Wellness proposal | seven-day mood mean 60% + seven-day session-goal attainment 25% + mood stability 15% | one explicit 1–5 mood check-in per day for seven days, completed sessions, explicit weekly goal | null when a day is missing; no reverse scoring because this is not a multi-item instrument | Product approval and psychological wording review |
| Recovery | Sleep 40% + Body 30% + Activity Balance 20% + independent Lifestyle Balance 10% | calculated Sleep, 14+ same-type HRV/RHR baseline, AB-01 history, all four explicit lifestyle entries | null when any child is missing | Product methodology approval |

Body Recovery is the mean of personal-baseline HRV and inverse resting-heart-rate candidates. Lifestyle Balance is only the mean of four explicitly recorded binary entries (Yes=100, No=0): consistent daily routine, recovery/rest practice, evening screen boundary and outdoor/daylight routine. An omitted answer is missing—not No. Sleep, activity and mindfulness are not included in Lifestyle Balance, preventing circularity and double counting.

## Persistence and provenance

Lifestyle entries use the established tenant-owned `health_events` contract with `LIFESTYLE_BALANCE_V1_PROPOSAL`. Each event carries authenticated user/care-case ownership, habit type, health day, explicit completion, revision, record status, mobile Tracker provenance and event timestamps. Existing replay keys provide idempotency; the identity-scoped mobile queue provides offline/restart/reauthentication replay. A later higher revision wins per habit/day. A revocation event removes that habit from eligibility, making the day incomplete.

Everyday Nourishment reads only actual Nutrition consumption events. It must not use scheduled or prescribed meals. Current production consumption projections expose protein, hydration and fibre but do not yet guarantee verified food group and added-sugar metadata for every consumed item. Therefore the proposal correctly remains unavailable for those records until that canonical metadata contract is completed.

Self-Reported Mind Wellness reads daily check-ins and completed wellness-session health events. It is separate from the original Mind score and is never labelled clinically validated.

## Formula lineage reconciliation

Commit `b7eb656e96a780748c194976513643b79fcd4bd0` introduced the executable Original Mind candidate at 40% / 35% / 15% / 10%, together with its formula register and tests. Commit `9ca6832eba671cca4dc8abdb81f7f4bad4f2104c` later documented 30% / 25% / 20% / 25% in this release package without changing executable code, tests, methodology version, or recording a rationale. The latter was therefore a documentation-only inconsistency, not an authorised methodology revision. The executable formula remains unchanged and production activation remains closed until Product explicitly decides the versioned methodology.

The same audit found no executable weight drift for Activity, Sleep, Calm, strict Nourishment, Everyday Nourishment, or Recovery. Lifestyle Balance intentionally changed at `9ca6832` to the independent mean of four explicit habits to remove circular reuse of Sleep, Activity and mindfulness; its proposal version and approval requirement are explicit.

## Actionable approval decisions

| Decision | Exact proposed method / threshold | Proposed wording | Rationale and limitation | Consequence of rejection |
|---|---|---|---|---|
| Activity Balance | AB-01: 40% 14-day load balance + 35% seven-day distribution + 25% source-backed rest; complete windows only | “Activity Balance reflects consistency against your configured activity goals.” | Product goal-attainment indicator; not fitness capacity | Activity may still show Steps/Exercise attainment, but the composite remains unavailable |
| Everyday Nourishment | Protein, hydration and verified consumed-food quality at 1/3 each; food quality is equal diversity/5 groups, fibre/25 g and inverse added sugar/50 g | “Everyday Nourishment summarises complete food and hydration logs; it is not medical nutrition advice.” | Requires consumed—not planned—foods and governed added sugar. Current catalogue lacks added sugar | Keep proposal unavailable; strict clinical Nourishment is unchanged |
| Self-Reported Mind Wellness | Seven daily 1–5 moods normalised to 0–100: mean 60% + seven-day session-goal attainment 25% + stability `100-population SD` 15% | “Mind Wellness reflects your own check-ins and completed wellness sessions; it is not a mental-health assessment.” | Product wellness proposal; exact seven days, no interpolation | Original Mind remains pending and no substitute score is displayed |
| Lifestyle Balance | Mean of four explicit binary habits; Yes=100, No=0; all four required each day | “Lifestyle Balance reflects the daily routines you explicitly recorded.” | Independent of Sleep/Activity to avoid double counting | Recovery remains unavailable because its 10% child is missing |
| Recovery | Sleep 40% + mean(personal-baseline SDNN or RMSSD, inverse RHR) 30% + AB-01 20% + Lifestyle 10%; ≥14 same-type baseline days | “Recovery is a non-diagnostic wellness estimate based on available personal data.” | Product aggregation; physiological interpretation requires professional review | Recovery and seven-day Recovery remain candidate-only/null |
| Original Mind weights | Retain executable 40/35/15/10 or approve a newly versioned 30/25/20/25 method | No user-facing label until a validated wellbeing instrument is selected | No rationale or code exists for the documentary alternative | Original Mind stays methodology-pending |

Professional review is required before physiological HRV/RHR or Sleep thresholds, PSS-10 interpretation, clinical nutrition marker transformations, or any medical/mental-health claim is activated. That review does not block separately approved, plainly labelled goal-attainment indicators from operating in their own versioned domains.

## Canonical food limitation

New approved-meal consumption events now preserve the frozen governed food identity/version and component fibre provenance. The frozen Common Food contract has no governed component food-group role and no added-sugar nutrient. Both fields are recorded as explicit `null`; zero remains distinguishable from unknown, and total sugar is never substituted. Consequently `EVERYDAY_NOURISHMENT_V1_PROPOSAL` remains unavailable for current persisted catalogue records. Making it numeric requires a separately governed catalogue/schema addition and backfill policy; this candidate deliberately does not fabricate that data.

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
