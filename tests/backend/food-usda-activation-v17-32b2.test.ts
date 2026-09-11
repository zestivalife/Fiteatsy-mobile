import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { generateMealCombinations, MEAL_HEADS, type ClientFoodContext, type MealTarget } from '../../backend/src/modules/nutrition/common-food-engine.js';
import { createUsdaActivationV1732B2Records, FOOD_USDA_ACTIVATION_V17_32B2_ARTIFACT_SHA256 } from '../../backend/src/modules/nutrition/food-usda-activation-v17-32b2.js';

const records = createUsdaActivationV1732B2Records();
const newMappings = records.filter((record) => record.activationType === 'NEW_MAPPING');
const aliases = records.filter((record) => record.activationType === 'ALIAS_EXISTING');
const byId = new Map(commonFoodCatalogue.map((food) => [food.id, food]));
const active = commonFoodCatalogue.filter((food) => food.active);
const generator = active.filter((food) => food.generatorEligible && food.clientConsumable);
const component = active.filter((food) => food.clientConsumable);

test('v17.32B-2 activates exactly the frozen 47-item queue', () => {
  assert.equal(records.length, 47);
  assert.equal(newMappings.length, 43);
  assert.equal(aliases.length, 4);
  assert.equal(new Set(records.map((record) => record.referenceItemId)).size, 47);
  assert.equal(new Set(newMappings.map((record) => record.selectedFdcId)).size, 43);
  assert.match(FOOD_USDA_ACTIVATION_V17_32B2_ARTIFACT_SHA256, /^[a-f0-9]{64}$/);
});

test('v17.32B-2 creates new governed foods without duplicating alias identities', () => {
  for (const record of newMappings) {
    const food = byId.get(record.governedFoodId);
    assert.ok(food, record.referenceItemId);
    assert.equal(food.sourceMappingId, `USDA_FDC:${record.selectedFdcId}`);
    assert.deepEqual(food.nutrientsPer100g, record.nutritionPer100g);
    assert.equal(food.servings.length, 1);
    assert.equal(food.servings[0].label, '100 g');
    assert.equal(food.servings[0].grams, 100);
  }
  for (const record of aliases) {
    assert.ok(byId.get(record.existingGovernedFoodId!), record.referenceItemId);
    assert.equal(byId.has(record.referenceItemId), false);
  }
  assert.equal(commonFoodCatalogue.filter((food) => food.sourceMappingId === 'USDA_FDC:321360').length, 1);
  assert.equal(commonFoodCatalogue.filter((food) => food.sourceMappingId === 'USDA_FDC:169228').length, 1);
  assert.equal(commonFoodCatalogue.filter((food) => food.sourceMappingId === 'USDA_FDC:2346407').length, 1);
});

test('v17.32B-2 preserves required nutrition, serving, and activation gates', () => {
  for (const record of records) {
    for (const key of ['kcal', 'protein', 'carbohydrate', 'fat']) assert.equal(Number.isFinite(record.nutritionPer100g[key as keyof typeof record.nutritionPer100g]), true, `${record.referenceItemId}:${key}`);
    assert.equal(record.servingProfile.label, '100 g');
    assert.ok(['DIRECT_ADDABLE', 'COMPONENT_ADDABLE', 'INGREDIENT_ONLY', 'SECONDARY_ONLY'].includes(record.operationalUse));
    assert.ok(record.roles.length > 0);
    assert.ok(record.auditEvents.includes(record.activationType === 'ALIAS_EXISTING' ? 'USDA_ALIAS_MERGED' : 'USDA_MAPPING_ACTIVATED'));
    if (record.generatorEligible) {
      assert.equal(record.activationType, 'NEW_MAPPING');
      assert.equal(record.componentEligible, true);
      assert.notEqual(record.operationalUse, 'INGREDIENT_ONLY');
      assert.equal(record.canonicalName.toLowerCase().startsWith('raw '), false);
    }
  }
});

test('v17.32B-2 frozen activation counts are preserved inside the current expanded runtime', () => {
  assert.ok(generator.length >= 115, `current generator pool regressed below the accepted v17.32B-2 baseline: ${generator.length}`);
  assert.ok(component.length >= 126, `current component pool regressed below the accepted v17.32B-2 baseline: ${component.length}`);
  assert.equal(new Set(active.map((food) => food.id)).size, active.length);
  assert.equal(records.filter((record) => record.generatorEligible).length, 40);
  assert.equal(records.filter((record) => record.componentEligible).length, 42);
  assert.equal(records.filter((record) => record.directAddEligible).length, 16);
  assert.equal(records.filter((record) => record.operationalUse === 'INGREDIENT_ONLY').length, 1);
  assert.equal(records.filter((record) => record.operationalUse === 'SECONDARY_ONLY').length, 2);
});

test('v17.32B-2 aliases are searchable against the single existing governed identity', () => {
  const tomato = byId.get('CF_699ec058-eb2c-4942-9bc4-7d851745a299');
  const brinjal = byId.get('CF_b2708c84-9a70-4d12-b757-80c14bc8e396');
  const cabbage = byId.get('CF_31c4731b-d789-41d4-9cbd-c9614dd328b3');
  assert.ok(tomato?.aliases.includes('tamatar'));
  assert.ok(tomato?.aliases.includes('cherry tomato'));
  assert.ok(brinjal?.aliases.includes('long eggplant'));
  assert.ok(cabbage?.aliases.includes('patta gobhi'));
});

test('v17.32B-2 representative Food Explorer identities are verified with correct add eligibility', () => {
  for (const name of ['Bitter gourd', 'Zucchini', 'Radish', 'Green peas', 'Button mushroom', 'Guava', 'Pomegranate', 'Grapes', 'Tender coconut water', 'Avocado']) {
    const food = commonFoodCatalogue.find((item) => item.displayName === name);
    assert.ok(food, name);
    assert.equal(food.active, true);
    assert.equal(food.servings[0].label, '100 g');
    assert.equal(food.clientConsumable, true);
  }
  const rawPapaya = commonFoodCatalogue.find((item) => item.displayName === 'Raw papaya');
  assert.ok(rawPapaya);
  assert.equal(rawPapaya.generatorEligible, false);
});

test('v17.32B-2 importer and migration are idempotent by construction', () => {
  const importer = readFileSync(new URL('../../backend/scripts/import-food-usda-activation-v17-32b2.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../backend/src/db/migrations/0059_food_usda_activation_v17_32b2.sql', import.meta.url), 'utf8');
  assert.match(importer, /on conflict\(reference_item_id\) do update/);
  assert.match(importer, /on conflict\(activation_id, event_type, processor_version\) do nothing/);
  assert.match(migration, /unique index if not exists food_catalogue_usda_activation_v17_32b2_new_fdc_idx/);
  assert.match(migration, /where activation_type = 'NEW_MAPPING'/);
});

test('v17.32B-2 keeps 7 meal heads x 5 options under controlled generation', () => {
  const context: ClientFoodContext = { diet: 'VEGETARIAN', allergies: [], intolerances: [], avoids: [], clinicalExclusions: [], dislikes: [], preferences: [] };
  const target: MealTarget = { kcal: 500, protein: 25, kcalTolerance: 200, proteinTolerance: 25 };
  for (const mealHead of MEAL_HEADS) {
    const result = generateMealCombinations({ foods: commonFoodCatalogue, context, mealHead, target, semanticV1: true, rankingV3: true });
    assert.equal(result.options.length, 5, mealHead);
  }
});
