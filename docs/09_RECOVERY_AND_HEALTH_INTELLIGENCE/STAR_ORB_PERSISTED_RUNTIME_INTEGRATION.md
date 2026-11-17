# Star Orb persisted runtime integration

## Safety boundary

The authenticated database loader is `loadStarOrbRuntimeInputs`. The candidate API is available only when both `NODE_ENV !== production` and `STAR_ORB_CANDIDATE_VALIDATION_ENABLED=true`. The mobile consumer additionally requires `__DEV__` and `EXPO_PUBLIC_STAR_ORB_CANDIDATE_VALIDATION_ENABLED=true`. Candidate results are never written to `health_scores`; production routes and Consultant projections remain unchanged.

## Repository coverage

| Input | Canonical source | Loader | Provenance/history | Current result |
|---|---|---|---|---|
| Wearable observations | `health_observations` | `listHealthObservationsForCalculation` | HealthKit/Health Connect provider identity; full retained history | Integrated, provider identity deduplicated |
| Sleep target | `health_profiles.sleep_goal_hours` | tenant/client-scoped profile query | User profile; effective from profile creation | Integrated when explicitly set |
| Protein/hydration targets | published nutrition plan | `getClientNutritionExperience` | Consultant-published plan, day-specific | Integrated when a plan exists |
| Food consumption/hydration | `health_events` (`meal_logged`, `water_logged`) | `getClientNutritionExperience` | Client nutrition events | Integrated; incomplete days stay missing |
| PSS-10 | `assessment_results` | tenant/client-scoped result query | Completed validated instrument | Integrated with timezone health-day attribution |
| Mood history | `daily_checkins.mood` | tenant/client-scoped check-in query | Explicit self-report, seven-day window | Integrated |
| Numeric Steps/Exercise goals | No canonical persisted source | None | — | Unavailable; Activity fails closed |
| Mindfulness/session history and goal | No canonical persisted source | None | — | Unavailable; Calm/Mind fail closed |
| Validated wellbeing instrument | No canonical persisted source | None | — | Unavailable; Mind fails closed |
| Food-quality dimensions | No approved projection | None | — | Unavailable; Nourishment fails closed |
| Approved marker-specific scores | No approved projection | None | — | Unavailable; Nourishment fails closed |

## Methodology approval register

All formulas use `FITEATSY_STAR_ORB_V1 / 1.0.0-candidate.1` and remain candidate-only.

| Domain | Candidate calculation | Minimum inputs/history | Limitation and required approval | Without approval |
|---|---|---|---|---|
| Activity | Steps 40% + Exercise 40% + AB-01 20% | Explicit goals; 14 activity days; 7 rest days | Product approval plus clinical review of balance interpretation | Null/pending in production |
| Sleep | Duration 40% + quality 40% + SC-01 20% | Target; seven complete wake-day nights; stages/opportunity | Clinical review of stage bands; product interpretation approval | Null/pending |
| Nourishment | Protein 25% + hydration 20% + food quality 30% + approved markers 25% | Complete diary and all four approved components | Clinical governance for marker mapping and food-quality model | Null/pending |
| Calm | Same-type HRV 40% + PSS-10 30% + mindfulness 30% | 14-day SDNN or RMSSD baseline; valid PSS-10; explicit mindfulness goal | Clinical review of HRV normalization; product UX approval | Null/pending |
| Mind | Mood 40% + wellbeing 35% + sessions 15% + stability 10% | Seven self-report days, validated wellbeing, explicit session goal | Product UX score and clinical non-diagnostic language review | Null/pending |
| Recovery | Sleep 40% + Body 30% + Activity Balance 20% + Lifestyle 10% | Complete independent children and 14-day personal baselines | Clinical review of composite interpretation and thresholds | Null/pending |

These are wellness/product scores, not medically validated health status. Deterministic output does not constitute clinical validation.
