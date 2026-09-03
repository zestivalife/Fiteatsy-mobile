# Controlled Indian Food Data Acquisition and Curation v1

## Decision

Fiteatsy recognizes two evidence classes only:

1. `DIRECT_SOURCE_FOOD`: factual nutrition directly supported by an approved, version-pinned, commercially reusable source.
2. `FITEATSY_CONTROLLED_PREPARATION`: nutrition deterministically calculated from approved ingredient Food Versions, an approved quantitative formula, physically measured final yield and serving, and approval by a qualified Nutrition Reviewer bound to the exact calculation hash.

Search results, competitor databases, AI estimates, ambiguous licences, generic household conversions, and manually guessed values are prohibited factual sources.

## Current source classification

- USDA FoodData Central: approved for the repository-pinned records under its official CC0/public-domain statement. Every derived record retains the FDC ID and pinned artifact hash.
- IFCT 2017: research-only until explicit commercial-use and redistribution rights are documented.
- Unverified public web content: rejected.

## Calculation contract

- All ingredient versions are pinned; “latest” is never resolved at calculation time.
- Core nutrients are required. A missing core value fails calculation.
- Optional nutrient unknowns propagate as unknown; verified zero remains zero.
- Ingredient contributions are scaled from their explicit gram basis, summed without intermediate rounding, and divided by physically measured edible final yield.
- Water contributes no nutrient value but changes final yield and nutrient density.
- Oil is an ingredient with its own approved source record; retained oil is measured through the governed batch rather than guessed.
- Serving nutrition scales from calculated per-100-g nutrition using a Food-specific measured serving weight.
- Formula, ingredient version, measurement, serving, or methodology changes create a different calculation hash and invalidate prior approval.

## Review workflow

`DRAFT → MEASURED → CALCULATED → VALIDATED → NUTRITION_REVIEW_PENDING → APPROVED → PACKAGED`

`CHANGES_REQUIRED` and `REJECTED` are terminal review outcomes for a revision. Only a qualified reviewer may create `APPROVED`, and approval must reference the exact calculation SHA-256.

## Current limitation

Pack 1 formulas are proposed review inputs. No physical batch yield, Food-specific vessel/piece measurement, or qualified reviewer approval exists in the repository. Therefore no controlled preparation is packaged or imported, and Indian Food Population remains blocked pending those human operations.
