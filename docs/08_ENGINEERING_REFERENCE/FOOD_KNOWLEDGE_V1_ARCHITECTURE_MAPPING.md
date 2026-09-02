# Food Knowledge DB v1 — Architecture and Baseline Audit

## Existing schema mapping

| Existing concept | Decision | Food Knowledge implementation |
|---|---|---|
| `nutrition_foods` | Reuse | Stable canonical Food identity; additive profile supplies governed code/type/Family. |
| `nutrition_food_portions` | Preserve | Current Catalogue servings remain unchanged; version-addressed Food Knowledge servings coexist until an approved migration. |
| Macro columns and micronutrient JSON | Preserve | Current engine remains unchanged; relational version nutrients become the scalable factual model. |
| `nutrition_recipes` and components | Preserve | Current Catalogue recipes remain active; Food Knowledge composition models exact preparation facts. |
| `nutrition_meal_variants` | Preserve | Current Diet candidate path remains active; generated meals never become canonical Foods. |
| `nutrition_catalogue_releases` | Preserve | Catalogue v1.1 remains immutable; Food Knowledge releases have separate governed lifecycle and hash. |
| Food Preference profile | Reuse | Client-owned context remains in health profile and Consultant workspace projection. |
| Diet Version snapshots | Reuse | Historical approved/published truth is not rehydrated through Food Knowledge. |

## Client preference capture gaps

| Dimension | Current State | Canonical Storage | Consultant Visible | Future Mapping Required |
|---|---|---|---|---|
| Diet Pattern | SUPPORTED | `food_preference_profile.dietType` | YES | Map enum to compatibility code |
| Cuisine | SUPPORTED | `food_preference_profile.cuisines[]` | YES | Map labels to Cuisine IDs |
| Staples | SUPPORTED | `food_preference_profile.staplePreference` | YES | Map to staple Family |
| Protein Sources | SUPPORTED | `food_preference_profile.proteins[]` | YES | Map to protein Family/Food IDs |
| Dairy | SUPPORTED | `food_preference_profile.dairyPreference` | YES | Extend to individual Food targeting |
| Soy | PARTIAL | Protein/avoid/allergy arrays | YES where entered | Canonical Soy Family/Allergen mapping |
| Food Likes | SUPPORTED | `foodsLiked[]`, `likedFoodIds[]` | YES | Complete canonical ID migration |
| Food Dislikes | SUPPORTED | `foodsDisliked[]`, `dislikedFoodIds[]` | YES | Complete canonical ID migration |
| Explicit Avoids | SUPPORTED | `foodsAvoided[]`, `avoidedFoodIds[]` | YES | Complete component/Family mapping |
| Allergies | SUPPORTED | `health_profiles.food_allergies[]` | YES | Map to Allergen IDs |
| Intolerances | SUPPORTED | `health_profiles.food_intolerances[]` | YES | Add governed intolerance taxonomy |
| Jain / Preparation Profile | PARTIAL | Diet type/restrictions free values | YES where entered | Dedicated preparation-profile code |
| No Onion | PARTIAL | `restrictions[]` | YES | Map to preparation profile/component ID |
| No Garlic | PARTIAL | `restrictions[]` | YES | Map to preparation profile/component ID |
| Practicality | SUPPORTED | `food_preference_profile.practicality[]` | YES | Map to Context Tag IDs |

## Contextual food taxonomy

- Context Tag foundation: PASS
- Sensory category: PASS
- Practicality category: PASS
- Eating-Out context category: PASS
- Many-to-many Food mapping: PASS
- Canonical code stability: PASS
- Release governance: PASS
- Projection parity: PASS
- Feature-specific duplicate Food truth: 0

## Cuisine hierarchy

- Canonical Cuisine taxonomy: PASS
- Parent/child support: PASS
- North Indian group: PASS
- South Indian group: PASS
- Descendant resolution: PASS
- Direct + ancestor double counting: 0
- Display-name filtering: 0
- Frontend-only Cuisine truth: 0

## Contextual candidate discovery and quality

Discovery begins with distinct canonical Food/Family identity; Serving expansion follows Food discovery. Alias, source, Cuisine, and Context mappings do not consume the Food limit or duplicate Foods. Ingredient-only records are excluded, hard restrictions are structural, practical Serving is required for eligibility, and shortages remain truthful without duplicate padding.

## Current feature baselines

### Eating Out

- Source: reviewed optional guidance on the published Diet Version in `nutrition.service.ts`.
- Cuisine: fixed product keys and reviewed guidance tags.
- Food/Nutrition/Serving: approved Diet option snapshots, not Food Knowledge.
- Canonical Client Food Preference integration: NO.
- Hard eligibility integration: PARTIAL through already-reviewed Diet guidance.
- Cuisine-specific filtering: PARTIAL.
- North/South differentiation: implemented by existing guidance keys; Food Knowledge differentiation not active.
- Static/hardcoded source: YES for category vocabulary; option facts are reviewed snapshots.

### Craving

- Source: reviewed optional Diet guidance.
- Categories: sweet, salty, crunchy, spicy.
- Food/Nutrition/Serving: approved/reviewed Diet option snapshots.
- Canonical Client Food Preference integration: NO.
- Hard eligibility integration: PARTIAL through review.
- Canonical sensory taxonomy: NO in production; candidate foundation only.
- Static/hardcoded source: YES for category vocabulary.

### What Can I Eat Now

- Source: ranked approved Diet options and reviewed optional guidance.
- Food/Nutrition/Serving: published Diet snapshots.
- Actual Consumption integration: YES.
- Remaining Nutrition calculation: YES.
- Current Meal Context: YES.
- Canonical Client Food Preference integration: NO.
- Hard eligibility integration: inherited from approved/reviewed options, not live Food Knowledge.
- Static/hardcoded source: NO for options; existing deterministic ranking rules remain active.

Known shared gap: none of these production consumers use Food Knowledge v1 yet. That is intentional in Phase 1.

## Feature activation

- Consultant Food Preference projection: IMPLEMENTED on candidate branch.
- Consultant Food Preference UI: IMPLEMENTED on separate Consultant candidate branch.
- Food Knowledge production activation: NO.
- Diet Plan, Eating Out, Craving, What Can I Eat Now, Consumption, and Clinical Nutrition cutovers: NO.
