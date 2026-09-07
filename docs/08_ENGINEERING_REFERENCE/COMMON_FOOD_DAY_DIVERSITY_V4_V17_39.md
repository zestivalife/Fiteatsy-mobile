# Common Food Day Diversity V4 — v17.39

## Scope and frozen history

This is an additive selection authority above `COMMON_FOOD_RANKING_V3`. It does not change catalogue identities, nutrition, evidence, source mappings, aliases, servings, operational eligibility, templates, saved/published snapshots, Senior Review, Consultant Publish, client projection, or DOCX rendering. No migration is required.

## Root cause and current path

`generateCommonFoodPlan` called `generateMealCombinations` once per meal head. The combination engine applied eligibility, template construction, semantic meal validation, V3 scoring, sorting, and within-meal similarity filtering. After five options were returned, the service added only `result.options[0]` to `DailyFoodUsage`. Consequently, options 2–5 were invisible to the next meal's diversity penalties. Each meal therefore had partial awareness of one representative option rather than shared awareness of the actual 35-option day. No later template hydration re-sorted options; persistence validated components but recorded legacy ranking metadata. Explorer add/replace uses the same governed manual validator and did not apply day diversity.

V4 now asks the unchanged V3 engine for a bounded ranked pool of 30 options per meal. `selectDayDiverseOptions` consumes all seven pools in meal order, chooses five per meal, and shares exact-food, canonical family, adjacent-meal, and global option-hash state. A food is capped after use in three meal heads when the pool permits. When it does not, the selector returns an explicit `DIVERSITY_CONSTRAINED_POOL` shortage rather than selecting outside the governed V3 pool.

## Deterministic before/after cohort

Each row is one deterministic full 7 × 5 day using the accepted production catalogue and existing templates. Repetition counts are component occurrences beyond unique identity/family counts.

| Diet | Stage | Options | Unique foods | Repeated exact | Repeated families | Repeated combinations | Adjacent repeats | Foods in 4+ heads |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Vegetarian | Before | 35 | 29 | 56 | 71 | 2 | 2 | 0 |
| Vegetarian | After | 35 | 38 | 48 | 66 | 0 | 0 | 0 |
| Egg | Before | 35 | 26 | 59 | 72 | 2 | 3 | 0 |
| Egg | After | 35 | 37 | 49 | 65 | 0 | 0 | 0 |
| Non-vegetarian | Before | 35 | 27 | 58 | 70 | 2 | 3 | 0 |
| Non-vegetarian | After | 35 | 35 | 52 | 64 | 0 | 0 | 0 |

All after cohorts have exactly seven meal heads, five options per head, 35 globally unique combination hashes, zero adjacent exact-food repeats, and zero food identities spanning four or more meal heads.

## Performance

Fifteen deterministic full-day samples on the local acceptance runner:

| Stage | P50 | P95 | Max |
|---|---:|---:|---:|
| V3 direct top-five per meal | 145.116 ms | 172.754 ms | 172.754 ms |
| V3 pool plus V4 day selection | 339.278 ms | 388.403 ms | 388.403 ms |

The search is bounded by the engine's existing 500-combination cap and a 30-option pool per meal. V4 is deterministic greedy reranking, not combinatorial backtracking.

## Explorer contract

`RECOMMENDED` retains all existing safety, operational, generator, diet, serving, meal, and client-context gates. `ALL` starts from every active governed runtime identity plus searchable reference identities, including non-addable entries. Explicit search/facet filters remain supported, but the ALL scope does not enforce meal-context or operational addability.

Every item exposes `operationalUseState`, `addabilityStatus`, a readable status, action availability, and the exact reason an action is disabled. The response exposes total/searchable/recommended counts, exclusion reason counts, canonical role labels, scope semantics, and recovery actions for zero-result searches. Aliases and canonical/display names are searched before server-side pagination.

Admin-only diagnostics at `/v1/consultants/common-food/reports/day-diversity` report, per meal: searchable catalogue size, operational and generator eligibility, meal suitability, role counts, V3 top candidates, V4 penalties, selected options, and shortages. Normal client and consultant roles cannot access this debug surface.
