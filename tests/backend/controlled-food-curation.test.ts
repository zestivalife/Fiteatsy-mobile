import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyBatchMeasurementAudit, approvedFormulaSha256, assertApprovedIngredient, assertCurrentApproval, calculateControlledPreparation, calculationSha256, createCalculationInputManifest, deriveStageBStatus, formulaSha256, inspectMeasurement, inspectMeasurementSubmission, normalizeQuantityToGrams, reconcileCalculation, validateMeasurement } from '../../backend/src/modules/nutrition/food-curation/controlled-curation.engine.js';
import type { ControlledMeasurement, ControlledPreparationSpec, FoodSourceRegistryEntry, IngredientFact, PreparationReview } from '../../backend/src/modules/nutrition/food-curation/controlled-curation.types.js';

const approved: FoodSourceRegistryEntry = { id: 'USDA_FDC', name: 'FoodData Central', publisher: 'USDA ARS', datasetVersion: 'test-pinned', licence: 'CC0', commercialUse: 'YES', redistribution: 'YES', modification: 'YES', attribution: 'USDA ARS FoodData Central', reference: 'https://fdc.nal.usda.gov/', artefactSha256: 'a'.repeat(64), status: 'APPROVED', reviewNotes: '' };
const ingredient = (id: string, nutrients: IngredientFact['nutrients'], allergens: string[] = []): IngredientFact => ({ foodId: `food-${id}`, foodVersionId: id, canonicalName: id, sourceId: approved.id, sourceRecordId: `fdc-${id}`, basisGrams: 100, nutrients, allergens });
const rice = ingredient('rice-v1', { energy_kcal: 360, protein_g: 7, carbohydrate_g: 80, fat_g: 0.6, fibre_g: 1, calcium_mg: 10, iron_mg: 1, vitamin_c_mg: null });
const peanut = ingredient('peanut-v1', { energy_kcal: 567, protein_g: 25.8, carbohydrate_g: 16.1, fat_g: 49.2, fibre_g: 8.5, calcium_mg: 92, iron_mg: 4.6, vitamin_c_mg: 0 }, ['PEANUT']);
const spec: ControlledPreparationSpec = { preparationId: 'cp-1', canonicalFoodId: 'food-cp-1', proposedCanonicalName: 'Measured Rice Peanut Preparation', referenceBatchName: 'Pack 1 test batch', ingredients: [{ ingredientFoodVersionId: rice.foodVersionId, quantityGrams: 100, role: 'PRIMARY' }, { ingredientFoodVersionId: peanut.foodVersionId, quantityGrams: 10, role: 'SECONDARY' }], preparationMethod: 'BOILED', proposedWaterGrams: 180, yieldMethod: 'CONTROLLED_MEASUREMENT', proposedServingLabel: '1 measured katori', foodFamily: 'RICE', mealKeys: ['breakfast'], reviewState: 'MEASURED', formulaNotice: 'PROPOSED — REQUIRES NUTRITION REVIEW' };
spec.formulaVersion = 'fixture-v1';
spec.formulaSha256 = formulaSha256(spec);
const measurement: ControlledMeasurement = { measurementRunId: 'fixture-run-1', preparationId: spec.preparationId, formulaVersion: spec.formulaVersion, formulaSha256: spec.formulaSha256, ingredientWeightsGrams: { 'rice-v1': 100, 'peanut-v1': 10 }, waterGrams: 180, oilGrams: 0, finalPreparedWeightGrams: 250, servingLabel: '1 measured katori', servingWeightGrams: 125, servingObservationsGrams: [124, 125, 126], operator: 'operator-fixture', measurementDate: '2026-09-03', equipmentId: 'scale-fixture', referenceVesselId: 'katori-fixture', scaleResolutionGrams: 1, status: 'COMPLETE' };

test('source gate accepts only explicit commercially reusable approved sources', () => {
  assert.doesNotThrow(() => assertApprovedIngredient(rice, new Map([[approved.id, approved]])));
  for (const status of ['RESEARCH_ONLY', 'NEEDS_REVIEW', 'REJECTED'] as const) assert.throws(() => assertApprovedIngredient(rice, new Map([[approved.id, { ...approved, status }]])), /CURATION_SOURCE_NOT_APPROVED/);
});

test('g, mg, microgram and density-backed ml conversion is exact', () => {
  assert.equal(normalizeQuantityToGrams(1, 'g'), 1);
  assert.equal(normalizeQuantityToGrams(1_000, 'mg'), 1);
  assert.equal(normalizeQuantityToGrams(1_000_000, 'µg'), 1);
  assert.equal(normalizeQuantityToGrams(100, 'ml', 1.03), 103);
  assert.throws(() => normalizeQuantityToGrams(100, 'ml'), /CURATION_DENSITY_REQUIRED/);
});

test('yield-aware calculation preserves precision, water dilution and serving parity', () => {
  const result = calculateControlledPreparation(spec, measurement, [rice, peanut], [approved]);
  assert.equal(result.nutrientsPer100g.energy_kcal, (360 + 56.7) / 2.5);
  assert.equal(result.nutrientsPerServing.energy_kcal, result.nutrientsPer100g.energy_kcal! * 1.25);
  assert.equal(result.nutrientsPer100g.vitamin_c_mg, null);
  assert.deepEqual(result.allergens, ['PEANUT']);
});

test('verified zero is distinct from unknown', () => {
  const result = calculateControlledPreparation(spec, measurement, [rice, peanut], [approved]);
  assert.equal(result.nutrientsPer100g.vitamin_c_mg, null);
  const known = calculateControlledPreparation(spec, measurement, [{ ...rice, nutrients: { ...rice.nutrients, vitamin_c_mg: 0 } }, peanut], [approved]);
  assert.equal(known.nutrientsPer100g.vitamin_c_mg, 0);
});

test('measurement validation rejects mismatch, zero yield and missing audit identity', () => {
  validateMeasurement(spec, measurement);
  assert.throws(() => validateMeasurement(spec, { ...measurement, finalPreparedWeightGrams: 0 }), /CURATION_INVALID_MEASUREMENT_WEIGHT/);
  assert.deepEqual(inspectMeasurement(spec, { ...measurement, ingredientWeightsGrams: { ...measurement.ingredientWeightsGrams, 'rice-v1': 99 } }).warnings, ['CURATION_QUANTITY_DEVIATION:rice-v1']);
  assert.throws(() => validateMeasurement(spec, { ...measurement, ingredientWeightsGrams: { ...measurement.ingredientWeightsGrams, 'peanut-v1': 0 } }), /CURATION_STRUCTURAL_FORMULA_DEVIATION/);
  assert.throws(() => validateMeasurement(spec, { ...measurement, operator: '' }), /CURATION_INVALID_MEASUREMENT_AUDIT/);
});

test('blank, incomplete and estimated-style measurement evidence fails closed', () => {
  assert.equal(deriveStageBStatus(spec, null, null, null).state, 'MEASUREMENT_REQUIRED');
  assert.throws(() => validateMeasurement(spec, { ...measurement, measurementRunId: '', servingObservationsGrams: [] }), /CURATION_MEASUREMENT_RUN_ID_REQUIRED/);
  assert.throws(() => validateMeasurement(spec, { ...measurement, formulaSha256: '0'.repeat(64) }), /CURATION_FORMULA_HASH_MISMATCH/);
});

test('measurement and calculation manifests bind all governed hashes', () => {
  const manifest = createCalculationInputManifest(spec, measurement, [approved]);
  assert.match(manifest.measurementSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.formulaSha256, spec.formulaSha256);
  assert.equal(manifest.actualIngredientWeightsGrams['rice-v1'], 100);
  const calculated = calculateControlledPreparation(spec, measurement, [rice, peanut], [approved]);
  assert.equal(reconcileCalculation(calculated), true);
  assert.equal(calculated.measurementSha256, manifest.measurementSha256);
  assert.equal(deriveStageBStatus(spec, measurement, calculated, null).state, 'READY_FOR_STAGE_B_REVIEW');
});

test('ingredient Food Versions are pinned and unknown versions fail closed', () => {
  assert.throws(() => calculateControlledPreparation(spec, measurement, [rice], [approved]), /CURATION_UNKNOWN_INGREDIENT_VERSION:peanut-v1/);
});

test('approval is bound to exact deterministic calculation hash', () => {
  const result = calculateControlledPreparation(spec, measurement, [rice, peanut], [approved]);
  const review: PreparationReview = { preparationId: spec.preparationId, calculationSha256: result.calculationSha256, reviewerRole: 'NUTRITION_REVIEWER', reviewerId: 'qualified-reviewer-fixture', reviewerQualification: 'synthetic fixture qualification', reviewedAt: '2026-09-03T00:00:00Z', state: 'APPROVED', notes: 'test fixture only' };
  assert.doesNotThrow(() => assertCurrentApproval(result, review));
  assert.throws(() => assertCurrentApproval({ ...result, calculationSha256: 'changed' }, review), /CURATION_STALE_APPROVAL/);
  assert.throws(() => assertCurrentApproval(result, { ...review, reviewerQualification: '' }), /CURATION_REVIEWER_AUTHORITY_REQUIRED/);
  assert.throws(() => assertCurrentApproval(result, null), /CURATION_EXPERT_APPROVAL_REQUIRED/);
});

test('same inputs rebuild to same SHA and factual changes alter it', () => {
  const first = calculateControlledPreparation(spec, measurement, [rice, peanut], [approved]);
  const second = calculateControlledPreparation(structuredClone(spec), structuredClone(measurement), structuredClone([rice, peanut]), structuredClone([approved]));
  assert.equal(first.calculationSha256, second.calculationSha256);
  assert.notEqual(first.calculationSha256, calculationSha256({ ...measurement, finalPreparedWeightGrams: 249 }));
});

test('Pack 1 references real pinned USDA records and remains explicitly pending human evidence', () => {
  const catalogue = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.1.json', import.meta.url), 'utf8')) as { foods: Array<{ fdcId: number }> };
  const pack = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/pack-1.pending-review.json', import.meta.url), 'utf8')) as { status: string; directSourceFoods: Array<{ fdcId: number }>; controlledPreparations: Array<{ id: string; proposedBatch: { ingredientsGrams: Record<string, number> } }> };
  const available = new Set(catalogue.foods.map((food) => food.fdcId));
  assert.equal(pack.status, 'CANDIDATE PARTIAL — HUMAN MEASUREMENT + EXPERT REVIEW REQUIRED');
  assert.ok(pack.directSourceFoods.every((food) => available.has(food.fdcId)));
  assert.equal(new Set(pack.controlledPreparations.map((food) => food.id)).size, 10);
  assert.ok(pack.controlledPreparations.every((food) => Object.values(food.proposedBatch.ingredientsGrams).every((quantity) => quantity > 0)));
});

test('real first-five operator template is blank, explicit and cannot masquerade as evidence', () => {
  const template = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/first-five.measurement-template.json', import.meta.url), 'utf8')) as { status: string; measurements: Array<Record<string, unknown>> };
  assert.equal(template.status, 'INCOMPLETE');
  assert.deepEqual(template.measurements.map((item) => item.preparationId), ['CP_CHAPATI', 'CP_MOONG_DAL', 'CP_BHINDI_SABJI', 'CP_BHINDI_ALOO', 'CP_POHA_PEANUT']);
  assert.ok(template.measurements.every((item) => item.status === 'INCOMPLETE' && item.measurementRunId === null && item.finalPreparedWeightGrams === null));
});

test('Stage B schema persists measurement, calculation and hash-bound review separately', () => {
  const migration = fs.readFileSync(new URL('../../backend/src/db/migrations/0043_controlled_food_stage_b.sql', import.meta.url), 'utf8');
  assert.match(migration, /controlled_food_measurement_runs/);
  assert.match(migration, /measurement_sha256 text not null unique/);
  assert.match(migration, /controlled_food_calculations/);
  assert.match(migration, /controlled_food_stage_b_reviews/);
  assert.match(migration, /reviewer_role = 'NUTRITION_REVIEWER'/);
});

test('user-confirmed Batch 1 evidence is preserved but cannot become a canonical Measurement Run without governed prerequisites', () => {
  const batch = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.user-confirmed-measurements.json', import.meta.url), 'utf8')) as { evidenceClassification: string; canonicalMeasurementRunsCreated: number; measurements: ControlledMeasurement[] };
  assert.equal(batch.evidenceClassification, 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE');
  assert.equal(batch.canonicalMeasurementRunsCreated, 0);
  assert.equal(batch.measurements.length, 5);
  for (const submitted of batch.measurements) {
    const result = inspectMeasurementSubmission(submitted);
    assert.match(result.submissionSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.canonicalMeasurementEligible, false);
    assert.ok(result.errors.includes('CURATION_APPROVED_FORMULA_HASH_REQUIRED'));
    assert.ok(result.errors.includes('CURATION_OPERATOR_REQUIRED'));
    assert.ok(result.errors.includes('CURATION_MEASUREMENT_DATE_REQUIRED'));
    assert.ok(result.errors.includes('CURATION_EQUIPMENT_ID_REQUIRED'));
    assert.ok(result.errors.includes('CURATION_SCALE_RESOLUTION_REQUIRED'));
  }
});

test('updated Chapati submission satisfies the explicit five-piece structural protocol without becoming canonical', () => {
  const batch = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.user-confirmed-measurements.json', import.meta.url), 'utf8')) as { measurements: ControlledMeasurement[] };
  const chapati = batch.measurements.find((item) => item.preparationId === 'CP_CHAPATI')!;
  const result = inspectMeasurementSubmission(chapati);
  assert.deepEqual(chapati.pieceWeightObservationsGrams, [36, 35, 34, 35, 35]);
  assert.equal(chapati.producedPieceCount, 5);
  assert.equal(chapati.finalPreparedWeightGrams, 175);
  assert.equal((chapati as ControlledMeasurement & { postCookingFatGrams: number }).postCookingFatGrams, 10);
  assert.ok(!result.errors.includes('CURATION_PIECE_PROTOCOL_MINIMUM_NOT_MET'));
  assert.ok(!result.errors.includes('CURATION_PIECE_BATCH_WEIGHT_MISMATCH'));
});

test('superseded four-piece Chapati evidence remains historically preserved', () => {
  const history = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.superseded-measurement-history.json', import.meta.url), 'utf8')) as { submissions: Array<{ state: string; producedPieceCount: number; canonicalMeasurementRunCreated: boolean }> };
  assert.equal(history.submissions[0].state, 'SUPERSEDED');
  assert.equal(history.submissions[0].producedPieceCount, 4);
  assert.equal(history.submissions[0].canonicalMeasurementRunCreated, false);
});

test('drained rinse water remains explicit and is never treated as retained ingredient water', () => {
  const batch = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.user-confirmed-measurements.json', import.meta.url), 'utf8')) as { measurements: ControlledMeasurement[] };
  const poha = batch.measurements.find((item) => item.preparationId === 'CP_POHA_PEANUT')!;
  const result = inspectMeasurementSubmission(poha);
  assert.equal(poha.waterUse, 'RINSE_DRAINED');
  assert.equal(poha.waterGrams, 250);
  assert.ok(result.warnings.includes('CURATION_DRAINED_RINSE_WATER_EXCLUDED_FROM_RETAINED_INGREDIENT_WATER'));
});

test('Stage A formula hash requires qualified approval and ignores non-material review prose', () => {
  const approvedReview = { preparationId: spec.preparationId, formulaVersion: spec.formulaVersion!, decision: 'APPROVED' as const, reviewerId: 'nutritionist-1', reviewerQualification: 'Registered Dietitian', reviewedAt: '2026-09-03T10:00:00Z', declaration: 'I approve this exact formula.' };
  const hash = approvedFormulaSha256(spec, approvedReview);
  assert.equal(hash, formulaSha256(spec));
  assert.equal(hash, approvedFormulaSha256(structuredClone(spec), { ...approvedReview, declaration: 'Different declaration text.' }));
  assert.notEqual(hash, approvedFormulaSha256({ ...spec, proposedWaterGrams: spec.proposedWaterGrams + 1 }, approvedReview));
  assert.throws(() => approvedFormulaSha256(spec, { ...approvedReview, decision: 'PENDING' }), /CURATION_STAGE_A_APPROVAL_REQUIRED/);
  assert.throws(() => approvedFormulaSha256(spec, { ...approvedReview, reviewerQualification: '' }), /CURATION_STAGE_A_REVIEW_AUTHORITY_REQUIRED/);
});

test('one explicit batch audit can populate each run without changing submitted physical values', () => {
  const audit = { operator: 'operator-1', measurementDate: '2026-09-03', equipmentId: 'scale-1', scaleResolutionGrams: 1 };
  const audited = applyBatchMeasurementAudit(measurement, audit);
  assert.equal(audited.operator, audit.operator);
  assert.equal(audited.measurementDate, audit.measurementDate);
  assert.deepEqual(audited.ingredientWeightsGrams, measurement.ingredientWeightsGrams);
  assert.equal(audited.finalPreparedWeightGrams, measurement.finalPreparedWeightGrams);
});

test('Stage A persistence and version-bound preparation evidence preserve recipe foundation', () => {
  const migration = fs.readFileSync(new URL('../../backend/src/db/migrations/0044_controlled_food_stage_a_and_preparation_evidence.sql', import.meta.url), 'utf8');
  assert.match(migration, /controlled_food_stage_a_formula_reviews/);
  assert.match(migration, /decision in \('PENDING','APPROVED','CHANGES_REQUIRED','REJECTED'\)/);
  assert.match(migration, /controlled_food_preparation_evidence/);
  assert.match(migration, /formula_review_id text not null references controlled_food_stage_a_formula_reviews/);
  assert.match(migration, /process_water_manifest jsonb/);
});

test('Stage A Batch 1 review pack is actionable and defaults every decision to pending', () => {
  const pack = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/stage-a.batch-1.pending-approval.json', import.meta.url), 'utf8')) as { status: string; formulas: Array<{ preparationId: string; formulaVersion: string; review: { decision: string }; water: { handling: string } }> };
  assert.equal(pack.status, 'PENDING');
  assert.deepEqual(pack.formulas.map((item) => item.preparationId), ['CP_CHAPATI', 'CP_MOONG_DAL', 'CP_BHINDI_SABJI', 'CP_BHINDI_ALOO', 'CP_POHA_PEANUT']);
  assert.ok(pack.formulas.every((item) => item.formulaVersion && item.review.decision === 'PENDING'));
  assert.equal(pack.formulas.find((item) => item.preparationId === 'CP_POHA_PEANUT')?.water.handling, 'PROCESS_WATER_RINSE_DRAINED_NOT_RETAINED');
});

test('Batch 1 source readiness records exact fats while remaining fail-closed for identity review, Moong Dal and Poha', () => {
  const source = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.source-readiness.json', import.meta.url), 'utf8')) as { ingredients: Array<{ identity: string; result: string }> };
  const byIdentity = new Map(source.ingredients.map((item) => [item.identity, item.result]));
  assert.equal(byIdentity.get('Dry flattened rice / Poha'), 'NO_ACCEPTABLE_APPROVED_SOURCE_MATCH');
  assert.equal(byIdentity.get('Split hulled yellow Moong Dal'), 'NO_ACCEPTABLE_APPROVED_SOURCE_MATCH');
  assert.equal(byIdentity.get('Refined sunflower oil'), 'SOURCE_CANDIDATE_REQUIRES_IDENTITY_REVIEW');
  assert.equal(byIdentity.get('Cow ghee'), 'SOURCE_CANDIDATE_REQUIRES_IDENTITY_REVIEW');
  assert.equal(byIdentity.get('Groundnut oil'), 'SOURCE_CANDIDATE_REQUIRES_IDENTITY_REVIEW');
  assert.equal(byIdentity.get('Whole-wheat atta'), 'CANONICAL_INGREDIENT_READY');
});

test('measurement submission history is append-only and separate from canonical runs', () => {
  const migration = fs.readFileSync(new URL('../../backend/src/db/migrations/0045_controlled_food_measurement_submission_history.sql', import.meta.url), 'utf8');
  assert.match(migration, /controlled_food_measurement_submissions/);
  assert.match(migration, /submission_sha256 text not null unique/);
  assert.match(migration, /supersedes_submission_id text references controlled_food_measurement_submissions/);
});

test('source identity review remains concise, first-five-only and entirely pending', () => {
  const task = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.source-identity-review.pending.json', import.meta.url), 'utf8')) as { status: string; items: Array<{ canonicalIdentity: string; decision: string }> };
  assert.equal(task.status, 'PENDING');
  assert.equal(task.items.length, 5);
  assert.ok(task.items.every((item) => item.decision === 'PENDING'));
  assert.ok(!task.items.some((item) => item.canonicalIdentity === 'SEMOLINA'));
  assert.equal(fs.existsSync(new URL('../../backend/src/modules/nutrition/FITEATSY_BATCH_1_SOURCE_IDENTITY_REVIEW_TASK_v1.docx', import.meta.url)), true);
});

test('source revalidation separates exact identity, rights and mandatory core Nutrition', () => {
  const source = JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.source-readiness.json', import.meta.url), 'utf8')) as { schemaVersion: string; ingredients: Array<{ identity: string; coreNutrition?: string; result: string }> };
  assert.equal(source.schemaVersion, 'FITEATSY_BATCH_1_SOURCE_READINESS_V2');
  const byIdentity = new Map(source.ingredients.map((item) => [item.identity, item]));
  assert.equal(byIdentity.get('Refined sunflower oil')?.coreNutrition, 'INCOMPLETE_FOR_FITEATSY_CORE');
  assert.equal(byIdentity.get('Cow ghee')?.coreNutrition, 'COMPLETE');
  assert.equal(byIdentity.get('Groundnut oil')?.coreNutrition, 'COMPLETE');
  assert.equal(byIdentity.get('Water')?.result, 'CANONICAL_PROCESS_EVIDENCE_METHOD_READY');
  assert.equal(byIdentity.has('Semolina'), false);
});
