# FITEATSY Calorie & Macro Allocation Contract v1

Status: candidate  
Identifier: `FITEATSY-CALORIE-MACRO-ALLOCATION-CONTRACT-v1`

## Governed method

The canonical daily nutrition prescription is authoritative. Seven meal targets use the existing Fiteatsy split: Early Morning 8%, Breakfast 22%, Mid-Morning 10%, Lunch 26%, Evening Snack 10%, Dinner 18%, Bedtime 6%. Deterministic largest-remainder reconciliation makes stored meal targets sum exactly to the daily target at whole-kcal precision and 0.1-g macro precision.

Meal calories use ±10%; daily calories use ±10%. Configured protein, carbohydrate, and fat targets use ±20%; configured fibre uses ±25%. Missing macro targets remain null and are not inferred from calories. These policies live in `calorie-macro-allocation.ts`, not UI code.

## Generation and serving rules

Generation applies hard safety and meal eligibility, deduplicates canonical recipe identity, then optimises each distinct recipe using the finite practical multipliers 0.5, 0.75, 1, 1.25, 1.5, 1.75, or 2. A portion that cannot enter every configured meal envelope is rejected. Portion variants never count as distinct recipes. A shortage is truthful; options are never fabricated.

## Lifecycle invariants

New versions persist the daily prescription, seven meal targets, actual option nutrition, target sources, tolerances, and methodology identifier in version JSON snapshots. The shared validator blocks review, approval, and publish for an outlier, duplicate family, missing target, or invalid daily choice envelope. Legacy versions without this identifier remain readable under their original contract. Review, approval, publish, DOCX, client delivery, and consumption use stored actual option values and do not rerun allocation.

## Frozen boundaries

This contract does not change client identity/assignment, biomarker facts or projections, disease rules, review state transitions, catalogue content/provenance, or consumption semantics. Any change to allocations, tolerances, practical serving increments, or validation requires a new methodology identifier and full frozen-contract regression.
