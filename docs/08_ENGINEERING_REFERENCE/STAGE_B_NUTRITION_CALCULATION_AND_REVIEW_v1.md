# Stage B Nutrition Calculation and Review v1

Status: engineering candidate. Real first-five calculation is blocked until governed physical measurements exist.

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

- Real first-five Measurement Runs: 0.
- Real controlled calculations: 0.
- Real Stage B approvals: 0.
- Validation release: not created.
- Primary next gate: `PHYSICAL_MEASUREMENT_EVIDENCE_REQUIRED`.
- Raw Moong Dal source: unresolved in the current Pack 1 manifest.
- Flattened Rice / Poha source: unresolved in the current Pack 1 manifest.
- Semolina source: unresolved in the current Pack 1 manifest; not a first-five calculation dependency but remains a Batch 2 dependency.
- Production deployment/import/activation: prohibited and unchanged.

## Security and isolation

The Stage B repository path is internal and has no public, Client, Consultant, Diet, Consumption, Biomarker, Subscription, or assignment route. Nutrition values are not logged by default. Test fixtures prove mechanics only and never change real evidence status.
