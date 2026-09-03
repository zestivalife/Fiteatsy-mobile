# Stage B Nutrition Calculation and Review v1

Status: engineering candidate. User-confirmed physical values have been submitted, but canonical Measurement Runs remain blocked by missing audit metadata and governed Stage A formula approvals/hashes.

## Canonical path

1. A qualified Stage A reviewer approves a versioned formula and its SHA-256.
2. An operator completes `FITEATSY_CONTROLLED_REFERENCE_BATCH_1_PHYSICAL_MEASUREMENT_WORKSHEET.docx` and transcribes the same facts into `first-five.measurement-template.json` without converting missing values to zero.
3. `inspectMeasurement` validates identity, formula parity, actual ingredient quantities, final yield, repeated serving evidence, equipment, operator, date, and hard structural deviations.
4. `createCalculationInputManifest` binds formula, measurement, ingredient-version, source-registry, serving, and calculation-method identities.
5. `calculateControlledPreparation` uses actual quantities and measured yield. Unknown nutrient values propagate as unknown; verified zero remains zero.
6. `reconcileCalculation` proves per-serving values scale from the exact per-100-g result.
7. A qualified Nutrition Reviewer records `APPROVED`, `CHANGES_REQUIRED`, or `REJECTED` against the exact calculation hash. A stale hash is rejected.
8. Only current approved calculation hashes may become candidate Food Version inputs. Release creation and production activation are separate governed operations.

## State transitions

`MEASUREMENT_REQUIRED → READY_FOR_CALCULATION → READY_FOR_STAGE_B_REVIEW → STAGE_B_APPROVED`

Alternative terminal/intervention states are `SOURCE_DEPENDENCY_BLOCKED`, `CHANGES_REQUIRED`, and `REJECTED`. A formula, measurement, source, yield, serving, or calculation-method change produces a new hash and invalidates the former approval.

## Current factual state

- User-confirmed first-five physical submissions: 5, integrity-bound by non-canonical submission hashes.
- Canonical first-five Measurement Runs: 0.
- Real controlled calculations: 0.
- Real Stage B approvals: 0.
- Validation release: not created.
- Primary next gate: `MEASUREMENT_PREREQUISITES_REQUIRED` (complete audit metadata, governed Stage A formula evidence, plus protocol-compliant Chapati piece sampling).
- Missing audit data: operator, measurement date, equipment ID, and scale resolution for all five submissions.
- Chapati: four of four produced pieces were recorded and reconcile to batch yield, but the accepted protocol explicitly requires at least five independently formed pieces; remeasurement is required. Post-cooking fat was reported without a quantitative weight and blocks calculation.
- Peanut Poha: 250 ml water is explicitly classified as drained rinse water. The v1 calculation path does not apply an invented retention coefficient.
- Stage A review: actionable five-Food JSON and DOCX packs exist with every decision `PENDING`; Formula SHA-256 generation is approval-gated and deterministic.
- Measurement audit metadata is modeled once at batch level and can be applied immutably to each submitted Food run.
- Recipe foundation: `RECIPE_FOUNDATION_PARTIAL`. Migration 0044 preserves version-bound formula, ingredient, process-water, method, measurement, yield, and evidence hashes. A consumer-facing Recipe projection/UI remains intentionally out of scope.
- Raw Moong Dal source: unresolved in the current Pack 1 manifest.
- Flattened Rice / Poha source: unresolved in the current Pack 1 manifest.
- Semolina source: unresolved in the current Pack 1 manifest; not a first-five calculation dependency but remains a Batch 2 dependency.
- Production deployment/import/activation: prohibited and unchanged.

## Security and isolation

The Stage B repository path is internal and has no public, Client, Consultant, Diet, Consumption, Biomarker, Subscription, or assignment route. Nutrition values are not logged by default. Test fixtures prove mechanics only and never change real evidence status.
