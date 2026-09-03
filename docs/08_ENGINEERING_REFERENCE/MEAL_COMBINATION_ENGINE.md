# Meal Combination Engine

`COMMON_FOOD_COMBINATION_ENGINE_V1` filters source validity and client safety before role matching, bounds each role pool, caps candidates at 500, calculates nutrition only from canonical values, ranks deterministically, and selects unique family/template signatures. Missing nutrients remain null. A pool below five returns `SHORTAGE`; it is never padded.
