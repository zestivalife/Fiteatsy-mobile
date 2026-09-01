# Fiteatsy USDA Nutrition Catalogue v1

## Decision

`FITEATSY-NUTRITION-CATALOGUE-v1` is the verified nutrition source for the pre-production catalogue candidate. It uses only USDA FoodData Central records and Fiteatsy-owned deterministic recipe compositions. It does not use IFCT/NIN mirrors, scraped websites, Edamam, FatSecret, or unverified nutrition values.

## Authoritative source chain

- USDA FoodData Central: <https://fdc.nal.usda.gov/>
- Download page: <https://fdc.nal.usda.gov/download-datasets/>
- Foundation Foods release: `2026-04-30`
- SR Legacy release: `2018-04`
- Licence: `CC0-1.0` / United States public domain
- Generator: `backend/scripts/generate-usda-catalogue.mjs`
- Immutable generated manifest: `backend/src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.json`
- Guarded ENV-C importer: `backend/scripts/import-nutrition-catalogue.ts`
- Database schema: `backend/src/db/migrations/0041_verified_nutrition_catalogue.sql`

Each ingredient stores its USDA FDC ID, FoodData Central data type, USDA publication date, catalogue version, source and licence. Catalogue-release rows store upstream releases, the generated manifest SHA-256 and record counts.

## Nutrition semantics

- Ingredient nutrition is stored per 100 g from the selected USDA record.
- Recipes are Fiteatsy-owned formulations composed from ingredient gram weights.
- Recipe totals are deterministic sums of ingredient nutrients, applying only explicit retention factors.
- Meal variants are deterministic portion multipliers over a recipe; they are not independent nutrition records.
- A nutrient is `null`/UNKNOWN when any required ingredient value is unavailable. UNKNOWN is never converted to zero and partial totals are not presented as complete totals.
- No recipe, suggestion, variant or client behaviour changes an approved or published Diet Plan. Only the accepted Consultant review and publish lifecycle can do that.

## Catalogue composition

- Verified USDA ingredients: 58
- Fiteatsy-owned Indian recipes: 55
- Deterministic meal variants: 220
- Combined catalogue records: 333
- Canonical meal heads: early morning, breakfast, mid-morning snack, lunch, evening snack, dinner and bedtime nutrition
- Supported diet patterns include vegan, vegetarian, eggetarian and non-vegetarian.

## Import and environment safety

The importer is deliberately protected by the destructive-test reset guard. It may populate only an explicitly acknowledged isolated test/ENV-C PostgreSQL target. This implementation does not authorise production population, production deployment or real-client mutation.

## Frozen contracts

This catalogue does not alter Phase C review/publish contracts, D1/D2 health contracts, Reports V2, B12 normalisation, Optional Guidance V2 semantics, the splash contract, Consultant RBAC, client identity, calories/macros calculation rules or published-plan immutability.

## Anti-regression gates

Normal CI must verify source provenance, exact catalogue version, record uniqueness, seven-meal coverage, Indian-first coverage, dietary coverage, deterministic recipe/variant totals, UNKNOWN propagation, importer guard enforcement and database idempotency. Any future source or catalogue version requires explicit product approval and a new immutable catalogue release.
