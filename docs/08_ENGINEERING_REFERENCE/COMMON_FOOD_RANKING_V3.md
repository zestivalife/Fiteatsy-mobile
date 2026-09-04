# Common Food Ranking V3

`COMMON_FOOD_RANKING_V3` is deterministic product-quality ranking, not medical scoring. It extends V2 without changing eligibility, nutrition sources, manual Consultant selection, saved plans, or lifecycle behavior.

## Order and boundaries

Safety, source governance, diet pattern, and meal-role eligibility remain hard gates. V3 then applies bounded soft factors for calorie/protein fit, starch stacking, exact-food and adjacent-meal repetition, vegetable/grain/pulse/protein family rotation, meal suitability, Indian pairing compatibility, and top-five similarity. Unknown metadata is neutral. Shortage fallback remains truthful and eligible foods are never made manually ineligible by ranking.

## Central weights

All weights live in `rankingV3Weights` in `common-food-ranking.ts`. Repetition curves are governed by `STRICT_ROTATION`, `MODERATE_ROTATION`, `FLEXIBLE_ROTATION`, and `STAPLE_ROTATION`. Potato is strict; rice and other grains use staple rotation; chapati/roti and dairy staples are flexible.

## Determinism and performance

Candidate metadata is derived once from the in-memory governed catalogue during scoring. Day usage is an in-memory context, so V3 adds no database query per food or candidate. Final ties use the immutable combination hash. Compact factor values are stored with generated option snapshots; no PII or verbose trace is added.

## Rollout

The server-only `COMMON_FOOD_RANKING_V3` environment switch is resolved in `src/config/common-food-ranking.ts`. V3 is enabled unless explicitly set to `false`; explicit disable preserves V2 ordering and policy. Existing saved/published selections are not re-ranked.
