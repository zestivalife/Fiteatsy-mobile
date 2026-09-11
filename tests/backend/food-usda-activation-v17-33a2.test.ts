import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { generateMealCombinations, MEAL_HEADS, type ClientFoodContext, type MealTarget } from '../../backend/src/modules/nutrition/common-food-engine.js';
import { createUsdaActivationV1733A2Records, FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256 } from '../../backend/src/modules/nutrition/food-usda-activation-v17-33a2.js';

const records = createUsdaActivationV1733A2Records();
const newMappings = records.filter((record) => record.activationType === 'NEW_USDA_MAPPING');
const aliases = records.filter((record) => record.activationType === 'ALIAS_EXISTING');
const active = commonFoodCatalogue.filter((food) => food.active);
const generator = active.filter((food) => food.generatorEligible && food.clientConsumable);
const component = active.filter((food) => food.clientConsumable);
const byId = new Map(commonFoodCatalogue.map((food) => [food.id, food]));

test('v17.33A-2 activates exactly the frozen 15-item queue', () => {
  assert.equal(records.length, 15);
  assert.equal(newMappings.length, 12);
  assert.equal(aliases.length, 3);
  assert.equal(new Set(records.map((record) => record.referenceItemId)).size, 15);
  assert.equal(new Set(newMappings.map((record) => record.selectedFdcId)).size, 12);
  assert.match(FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256, /^[a-f0-9]{64}$/);
});

test('v17.33A-2 creates new governed foods without duplicating alias identities', () => {
  for (const record of newMappings) {
    const food = byId.get(record.governedFoodId);
    assert.ok(food, record.referenceItemId);
    assert.equal(food.sourceMappingId, `USDA_FDC:${record.selectedFdcId}`);
    assert.deepEqual(food.nutrientsPer100g, record.nutritionPer100g);
    assert.equal(record.servingProfile.label, '100 g');
    assert.ok(food.servings.some((serving) => serving.id === record.servingProfile.id && serving.grams === 100));
  }
  for (const record of aliases) {
    assert.ok(byId.get(record.existingGovernedFoodId!), record.referenceItemId);
    assert.equal(byId.has(record.referenceItemId), false);
  }
  assert.equal(commonFoodCatalogue.filter((food) => food.sourceMappingId === 'USDA_FDC:169228').length, 1);
  assert.equal(commonFoodCatalogue.filter((food) => food.sourceMappingId === 'USDA_FDC:168191').length, 1);
});

test('v17.33A-2 preserves nutrition, serving, role and activation gates', () => {
  for (const record of records) {
    for (const key of ['kcal', 'protein', 'carbohydrate', 'fat']) assert.equal(Number.isFinite(record.nutritionPer100g[key as keyof typeof record.nutritionPer100g]), true, `${record.referenceItemId}:${key}`);
    assert.equal(record.servingProfile.label, '100 g');
    assert.ok(['DIRECT_ADDABLE', 'COMPONENT_ADDABLE', 'INGREDIENT_ONLY', 'SECONDARY_ONLY'].includes(record.operationalUse));
    assert.ok(record.roles.length > 0);
    assert.ok(record.auditEvents.includes(record.activationType === 'ALIAS_EXISTING' ? 'USDA_ALIAS_MERGED' : 'USDA_MAPPING_ACTIVATED'));
    if (record.generatorEligible) {
      assert.equal(record.activationType, 'NEW_USDA_MAPPING');
      assert.equal(record.componentEligible, true);
    }
  }
});

test('v17.33A-2 updates runtime pools additively from v17.32B-2 production state', () => {
  assert.ok(generator.length >= 115, `current generator pool regressed below the accepted v17.33A-2 baseline: ${generator.length}`);
  assert.ok(component.length >= 126, `current component pool regressed below the accepted v17.33A-2 baseline: ${component.length}`);
  assert.equal(new Set(active.map((food) => food.id)).size, active.length);
  assert.equal(records.filter((record) => record.generatorEligible).length, 12);
  assert.equal(records.filter((record) => record.componentEligible).length, 12);
  assert.equal(records.filter((record) => record.directAddEligible).length, 4);
});

test('v17.33A-2 aliases are searchable against existing governed identities', () => {
  const brinjal = byId.get('CF_b2708c84-9a70-4d12-b757-80c14bc8e396');
  const dates = byId.get('CF_6b712331-f71c-4885-b970-5c7f959b5b38');
  assert.ok(brinjal?.aliases.includes('green brinjal'));
  assert.ok(brinjal?.aliases.includes('baingan'));
  assert.ok(dates?.aliases.includes('khajur'));
});

test('v17.33A-2 importer and migration are idempotent by construction', () => {
  const importer = readFileSync(new URL('../../backend/scripts/import-food-usda-activation-v17-33a2.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../backend/src/db/migrations/0060_food_usda_activation_v17_33a2.sql', import.meta.url), 'utf8');
  assert.match(importer, /on conflict\(reference_item_id\) do update/);
  assert.match(importer, /on conflict\(activation_id, event_type, processor_version\) do nothing/);
  assert.match(migration, /unique index if not exists food_catalogue_usda_activation_v17_33a2_new_fdc_idx/);
  assert.match(migration, /where activation_type = 'NEW_USDA_MAPPING'/);
});

test('v17.33A-2 keeps 7 meal heads x 5 options under controlled generation', () => {
  const context: ClientFoodContext = { diet: 'VEGETARIAN', allergies: [], intolerances: [], avoids: [], clinicalExclusions: [], dislikes: [], preferences: [] };
  const target: MealTarget = { kcal: 500, protein: 25, kcalTolerance: 200, proteinTolerance: 25 };
  for (const mealHead of MEAL_HEADS) {
    const result = generateMealCombinations({ foods: commonFoodCatalogue, context, mealHead, target, semanticV1: true, rankingV3: true });
    assert.equal(result.options.length, 5, mealHead);
  }
});
