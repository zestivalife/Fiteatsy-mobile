# Fiteatsy Nutrition Catalogue v1.1 Candidate

Catalogue identity: `FITEATSY-NUTRITION-CATALOGUE-v1.1`

This successor preserves the immutable v1 artifact and its SHA-256
`775cf73607ea84b0da1017c6652d03c8e1a58cd03058391d555713102c6c55d5`.
It reuses the same 58 verified USDA FoodData Central component records and adds
nine deterministic Fiteatsy recipe families with canonical gram servings,
meal suitability, cuisine, dietary, and allergen metadata.

The candidate artifact SHA-256 is
`d59b5d8e9a62f7379a292b355b3dbd30300b3db990390d60e6a8ae9f5e30f77f`.
The machine-readable change manifest is
`backend/src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.1.changes.json`.

## Canonical family coverage before client filtering

| Meal head | v1 | v1.1 | Increase |
|---|---:|---:|---:|
| Early Morning | 3 | 10 | 7 |
| Breakfast | 8 | 17 | 9 |
| Mid-Morning | 4 | 13 | 9 |
| Lunch | 16 | 16 | 0 |
| Evening Snack | 4 | 13 | 9 |
| Dinner | 16 | 16 | 0 |
| Bedtime | 4 | 9 | 5 |

## TestPritanshi-equivalent governed envelope

The production-equivalent 2,101 kcal / 131 g protein fixture retains the
approved meal allocation and tolerance contract. Compatible distinct family
counts after portion optimisation are 9 / 8 / 10 / 5 / 10 / 8 / 7 in canonical
meal order. Final generation ranks and selects exactly five per meal.

This candidate does not authorise production import, deployment, or client
mutation. Those remain separate governed approvals.
