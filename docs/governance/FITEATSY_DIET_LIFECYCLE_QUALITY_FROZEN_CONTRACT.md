# FITEATSY-DIET-LIFECYCLE-QUALITY-CONTRACT-v1

Status: SOURCE CANDIDATE — production activation not yet authorised.

## Contract

- USDA food records are nutrient-source ingredients. They are not complete client meal options.
- A Diet option is a verified recipe/meal variant or a Consultant-authored meal variant with a stable identity, canonical serving, calories, and protein.
- The canonical meal sequence remains Early Morning, Breakfast, Mid-Morning, Lunch, Evening Snack, Dinner, and Bedtime.
- A reviewable Diet Version contains exactly five distinct options for each meal: 35 options in total.
- Save, reload, submission, Senior review, Request Changes, resubmission, approval, publication, and DOCX preserve the persisted option identities, meal mapping, order, serving, calories, and protein.
- Request Changes preserves the reviewed version and feedback. A successor draft derives from that content; unchanged selections are not regenerated.
- Approval is a governance transition and does not rerank or replace Diet content.
- DOCX export consumes an approved or published persisted Diet Version and rejects incomplete content; it never pads empty rows.
- Generation ranks only eligible meal variants and uses deterministic diversity. It never fills catalogue shortages with ingredients, duplicates, placeholders, or fabricated nutrition.
- Hard Food Preference and safety constraints remain authoritative. Soft preferences and diversity remain ranking signals.

## Protected upstream contracts

`FITEATSY-CLIENT-LIFECYCLE-CONTRACT-v1`, `FITEATSY-NUTRITION-INTELLIGENCE-CONTRACT-v1`, and `FITEATSY-NUTRITION-CATALOGUE-v1` remain unchanged. Published-plan immutability and consumption separation remain mandatory.

## Anti-reversion gate

CI must cover raw-ingredient exclusion, canonical serving and required nutrition, exact 7 × 5 completeness, duplicate rejection, lifecycle identity continuity, and DOCX content parity. The permanent PostgreSQL-backed gate is `tests/database/diet-lifecycle-quality.database.test.ts` in the existing `Consultant Database L3` workflow. Production functional freeze requires a separately authorised deployment and real-client acceptance.
