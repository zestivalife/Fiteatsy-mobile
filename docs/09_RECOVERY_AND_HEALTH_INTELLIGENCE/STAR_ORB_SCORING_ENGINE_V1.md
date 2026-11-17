# Fiteatsy Star Orb Scoring Engine V1

Methodology ID: `FITEATSY_STAR_ORB_V1`

Candidate version: `1.0.0-candidate.1`

Engineering status: implemented behind governance gates

Clinical validation: pending

Production composite activation: not authorised

## Contract and activation levels

The canonical engine never turns missing input into zero, never substitutes Overall for Recovery, and never repeats today's score into historical days. `PARTIAL` is not emitted because no partial-weight redistribution policy is approved. Only `NOT_APPLICABLE` inputs may be removed and reweighted.

Every durable score record must bind the engine result to canonical client ID, health day, methodology ID/version, calculation timestamp, privacy-safe input lineage, freshness, completeness, confidence, contributing factors, missing dependencies, and explanation. These identity and lineage fields belong to the persistence envelope; the pure shared formula remains client-independent.

| Level | Meaning | Runtime rule |
|---|---|---|
| A | Exact product-approved calculation | Active only with explicit valid inputs and goals |
| B | Deterministic product candidate | Callable in isolated validation; cannot feed production `ScoreResult` |
| C | Clinical interpretation/threshold needed | `METHODOLOGY_PENDING`, value `null` |

## Domain formulae

| Domain | Formula | Status |
|---|---|---|
| Steps | `min(max(actual,0) / explicitGoal × 100, 100)` | A; explicit positive personal goal required |
| Exercise | `min(max(minutes,0) / explicitTarget × 100, 100)` | A; explicit positive personal goal required |
| Activity | Steps 40% + Exercise 40% + Activity Balance 20% | Parent pending until Activity Balance is approved |
| Sleep | Duration 40% + Quality 40% + Consistency 20% | C; target, stage normalization, and consistency threshold unapproved |
| Nutrition | Protein 25% + Hydration 20% + Food Quality 30% + Clinical Marker 25% | C |
| Calm | HRV 40% + Stress 30% + Mindfulness 30% | C |
| Recovery | Sleep 40% + Body Recovery 30% + Activity Balance 20% + Lifestyle 10% | C |
| Cycle | Phase 40% + Symptoms 30% + Energy 30% | C when explicitly enabled; otherwise N/A |
| Overall | Activity 15% + Sleep 20% + Nutrition 20% + Calm 15% + Stress Recovery 15% + Cycle 15% | C; Cycle may be removed only when explicitly N/A |
| Mind | No approved numeric formula | C, non-numeric pending |

The fixed 10,000-step and 30-minute values remain Fitness display targets. They are not universal scoring goals. The engine receives `null` unless an explicit personal goal is supplied.

## Level B candidates (non-production)

### Activity Balance candidate AB-01

Minimum history: 14 consecutive source-backed daily activity-load values and 7 daily Recovery/rest values. Baseline is days -14 through -8; recent is days -7 through today.

- Load balance: `clamp(100 - abs(recentMean / baselineMean - 1) / 0.50 × 100)`
- Distribution: `clamp(100 - coefficientOfVariation(recent) × 100)`
- Recovery/rest: mean of the seven bounded daily values
- Candidate result: Load balance 40% + Distribution 35% + Recovery/rest 25%

The 50% deviation boundary, coefficient-of-variation mapping, component weights, meaning of activity load, and admissible Recovery/rest source require clinical validation. The code returns `CANDIDATE_ONLY` and cannot populate the Star Orb.

### Sleep Consistency candidate SC-01

Minimum history: seven valid local bedtime/wake pairs attributed to their wake day. Bedtime and wake time use circular means across midnight. Mean circular deviation is independently calculated for each.

- Regularity candidate: `clamp(100 - meanCircularDeviationMinutes / 120 × 100)`
- Consistency candidate: Bedtime regularity 50% + Wake regularity 50%

The 120-minute boundary and equal weighting require clinical validation. Missing sessions or invalid local clock values fail closed.

## Freshness, confidence, and interpretation

Current complete inputs yield high confidence; stale complete inputs retain their value with `STALE` and low confidence. Incomplete or methodology-pending results are null. No health labels, risk bands, diagnosis, or clinical advice are generated from candidate values.

SDNN and RMSSD remain separate source types. Raw stage minutes, HRV, resting heart rate, questionnaire results, food omissions, and absent laboratory tests are never treated as normalized 0–100 values.

## Five-node and history mapping

The visible nodes remain Activity, Sleep, Nourishment/Nutrition, Calm, and Mind. The centre remains Recovery. Overall Health Intelligence is separate and is never projected into the centre. The seven-day panel reads seven consecutive persisted `recovery` health days, retaining null gaps. It becomes numeric only after the Recovery methodology and all required children are approved.

## Activation blockers

Production numeric activation still requires approval of HS-01 through HS-23 as applicable, explicit personal-goal sourcing, Activity Balance AB-01 clinical review, Sleep Consistency SC-01 clinical review, source-backed component normalization, and a versioned recomputation policy. Migration `0106` already supplies same-day idempotency; no migration is introduced here.
