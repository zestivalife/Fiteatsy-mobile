import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertApprovedIngredient, assertCurrentApproval, calculateControlledPreparation, calculationSha256, normalizeQuantityToGrams, validateMeasurement } from '../../backend/src/modules/nutrition/food-curation/controlled-curation.engine.js';
import type { ControlledMeasurement, ControlledPreparationSpec, FoodSourceRegistryEntry, IngredientFact, PreparationReview } from '../../backend/src/modules/nutrition/food-curation/controlled-curation.types.js';

const approved: FoodSourceRegistryEntry = { id: 'USDA_FDC', name: 'FoodData Central', publisher: 'USDA ARS', datasetVersion: 'test-pinned', licence: 'CC0', commercialUse: 'YES', redistribution: 'YES', modification: 'YES', attribution: 'USDA ARS FoodData Central', reference: 'https://fdc.nal.usda.gov/', artefactSha256: 'a'.repeat(64), status: 'APPROVED', reviewNotes: '' };
const ingredient = (id: string, nutrients: IngredientFact['nutrients'], allergens: string[] = []): IngredientFact => ({ foodId: `food-${id}`, foodVersionId: id, canonicalName: id, sourceId: approved.id, sourceRecordId: `fdc-${id}`, basisGrams: 100, nutrients, allergens });
const rice = ingredient('rice-v1', { energy_kcal: 360, protein_g: 7, carbohydrate_g: 80, fat_g: 0.6, fibre_g: 1, calcium_mg: 10, iron_mg: 1, vitamin_c_mg: null });
const peanut = ingredient('peanut-v1', { energy_kcal: 567, protein_g: 25.8, carbohydrate_g: 16.1, fat_g: 49.2, fibre_g: 8.5, calcium_mg: 92, iron_mg: 4.6, vitamin_c_mg: 0 }, ['PEANUT']);
const spec: ControlledPreparationSpec = { preparationId: 'cp-1', canonicalFoodId: 'food-cp-1', proposedCanonicalName: 'Measured Rice Peanut Preparation', referenceBatchName: 'Pack 1 test batch', ingredients: [{ ingredientFoodVersionId: rice.foodVersionId, quantityGrams: 100, role: 'PRIMARY' }, { ingredientFoodVersionId: peanut.foodVersionId, quantityGrams: 10, role: 'SECONDARY' }], preparationMethod: 'BOILED', proposedWaterGrams: 180, yieldMethod: 'CONTROLLED_MEASUREMENT', proposedServingLabel: '1 measured katori', foodFamily: 'RICE', mealKeys: ['breakfast'], reviewState: 'MEASURED', formulaNotice: 'PROPOSED — REQUIRES NUTRITION REVIEW' };
const measurement: ControlledMeasurement = { preparationId: spec.preparationId, ingredientWeightsGrams: { 'rice-v1': 100, 'peanut-v1': 10 }, waterGrams: 180, oilGrams: 0, finalPreparedWeightGrams: 250, servingLabel: '1 measured katori', servingWeightGrams: 125, operator: 'operator-fixture', measurementDate: '2026-09-03', scaleResolutionGrams: 1 };

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
  assert.throws(() => validateMeasurement(spec, { ...measurement, ingredientWeightsGrams: { ...measurement.ingredientWeightsGrams, 'rice-v1': 99 } }), /CURATION_INGREDIENT_MEASUREMENT_MISMATCH/);
  assert.throws(() => validateMeasurement(spec, { ...measurement, operator: '' }), /CURATION_INVALID_MEASUREMENT_AUDIT/);
});

test('ingredient Food Versions are pinned and unknown versions fail closed', () => {
  assert.throws(() => calculateControlledPreparation(spec, measurement, [rice], [approved]), /CURATION_UNKNOWN_INGREDIENT_VERSION:peanut-v1/);
});

test('approval is bound to exact deterministic calculation hash', () => {
  const result = calculateControlledPreparation(spec, measurement, [rice, peanut], [approved]);
  const review: PreparationReview = { preparationId: spec.preparationId, calculationSha256: result.calculationSha256, reviewerRole: 'NUTRITION_REVIEWER', reviewerId: 'qualified-reviewer-fixture', reviewedAt: '2026-09-03T00:00:00Z', state: 'APPROVED', notes: 'test fixture only' };
  assert.doesNotThrow(() => assertCurrentApproval(result, review));
  assert.throws(() => assertCurrentApproval({ ...result, calculationSha256: 'changed' }, review), /CURATION_STALE_APPROVAL/);
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
