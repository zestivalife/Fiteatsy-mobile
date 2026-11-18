# Star Orb Candidate Formula Register V1

Methodology: `FITEATSY_STAR_ORB_V1@1.0.0-candidate.1`  
Activation: `CANDIDATE_ONLY`  
Clinical validation: `PENDING`  
Production API activation: **not authorised**

This register defines deterministic product hypotheses for engineering evaluation. It does not describe diagnosis, risk prediction, treatment advice, or clinically validated thresholds. Missing required data produces `INSUFFICIENT_DATA`; it is never replaced by zero. A stale complete input may retain a candidate value with `STALE` and low confidence.

## Governed goals

The resolver selects the first active, approved, in-range value in this order: user, Consultant, explicitly approved product default. Otherwise it emits `GOAL_REQUIRED`. UI display targets are not goals. Callers validate domain limits; the Sleep candidate uses 360–600 minutes, while step, exercise, protein, hydration, mindfulness, and session limits remain product configuration.

Goal attainment is `clamp(actual / target × 100, 0, 100)`.

## Activity

`Activity = Steps × 0.40 + Exercise × 0.40 + ActivityBalance × 0.20`.

AB-01 uses 14 consecutive activity-load days. Days -14…-8 form the baseline and days -7…today form recent load. `LoadBalance = clamp(100 - abs(recentMean / baselineMean - 1) / 0.50 × 100)`. `Distribution = clamp(100 - populationCoefficientOfVariation(recent) × 100)`. `RecoveryRest = mean(seven bounded source-backed recovery/rest values)`. `ActivityBalance = LoadBalance × 0.40 + Distribution × 0.35 + RecoveryRest × 0.25`. Non-positive baselines, non-finite values, or incomplete windows fail closed. Confidence is moderate at 14 days and high at 28 days.

Exercise minutes must be the canonical de-duplicated daily aggregate; overlapping workout and exercise intervals are unioned upstream.

## Sleep

`Sleep = Duration × 0.40 + Quality × 0.40 + Consistency × 0.20`.

For sleep at or below the target, `Duration = asleep / target × 100`. Above target, `Duration = clamp(100 - (asleep-target)/(target×0.5)×100)`. This asymmetric long-sleep penalty is a candidate assumption.

`Efficiency = asleep / opportunity × 100`. Deep and REM are proportions of asleep time. Their candidate band scores are 100 inside 13–23% and 20–25%, respectively; linear shoulders reach zero at 0/36% for Deep and 5/40% for REM. `Quality = Efficiency × 0.50 + DeepBand × 0.25 + RemBand × 0.25`. Invalid or overlapping stage totals fail closed; upstream canonical aggregation assigns sleep to the wake day.

SC-01 needs seven local bedtime/wake pairs. Each series uses circular mean and mean circular deviation. `Regularity = clamp(100 - deviationMinutes/120×100)`. `Consistency = BedtimeRegularity × 0.50 + WakeRegularity × 0.50`.

## Nourishment

`Nourishment = Protein × 0.25 + Hydration × 0.20 + FoodQuality × 0.30 + ClinicalMarkers × 0.25`.

Protein and Hydration use governed goal attainment. Food Quality is the mean of complete, explicitly approved 0–100 diary dimensions. Clinical Markers is the mean of marker-specific, approved 0–100 transformations supplied with validated value, unit, range, date, and provenance. The engine does not contain a generic biomarker transformation. A missing/incomplete food day or missing required marker method fails closed rather than indicating poor intake or health.

## Calm

`Calm = HRV × 0.40 + Stress × 0.30 + Mindfulness × 0.30`.

HRV uses at least 14 days of the same type only: `clamp(50 + (current / personalBaseline - 1) × 100)`. SDNN and RMSSD are never converted. A validated assessment maps its own declared range using `Stress = (maximum - observed)/(maximum-minimum)×100`; heart rate alone is never a stress input. Mindfulness uses verified minutes against a governed goal. Confidence is moderate at 14 days and high at 28 days.

## Mind

`Mind = Mood × 0.40 + ValidatedWellbeing × 0.35 + CompletedSessions × 0.15 + EmotionalPattern × 0.10`.

Mood is the mean of explicit 0–100 check-ins. Validated Wellbeing is the scale-specific upstream 0–100 result. Completed Sessions uses a governed goal. Emotional Pattern uses seven explicit self-reports: `clamp(100 - populationStandardDeviation)`. No wearable value is used or inferred. The result is non-diagnostic; confidence is moderate at seven days and high at 14 days.

The 30% Mood / 25% Wellbeing / 20% Sessions / 25% Emotional History weights appearing in the later release-package draft were never implemented, versioned, or justified. They are an unresolved product alternative, not the executable method. Until Product approves a separately versioned change, this register and the tested 40% / 35% / 15% / 10% candidate remain authoritative for engineering validation only.

## Recovery

`Recovery = Sleep × 0.40 + BodyRecovery × 0.30 + ActivityBalance × 0.20 + LifestyleBalance × 0.10`.

`BodyRecovery = mean(sameTypeHRV, RestingHeartRate)`. HRV uses the Calm personal-baseline transformation. RHR uses `clamp(50 - (current/baseline - 1)×100)`. Both require at least 14 personal-baseline days. Sleep is already the independent 40% Recovery child and is not counted again inside Body Recovery.

`LifestyleBalance = mean(four explicit daily lifestyle habits)`, where each explicit Yes is 100 and No is 0. The four proposal inputs are consistent daily routine, recovery/rest practice, evening screen boundary, and outdoor/daylight routine. Missing answers make the component unavailable. Sleep behaviour, Activity Distribution and mindfulness are not reused inside Lifestyle Balance, preventing double counting. Recovery never consumes Overall Health Intelligence.

## Seven-day Recovery

Exactly seven distinct consecutive ISO health days are evaluated separately using each day's canonical inputs and methodology version. The engine rejects duplicates and non-consecutive windows. Insufficient days retain null gaps. Persistence remains keyed by client, account, score type, version, and health day under migration 0106, so recalculation is idempotent and does not overwrite another methodology version.

## Approval dependencies

All physiological bands, long-sleep handling, baseline curves, component weights, assessment transformations, food-quality dimensions, marker-specific methods, and lifestyle components remain candidate assumptions pending their named product/clinical owners. The production `ScoreResult` path remains fail-closed and is not fed by this module.
