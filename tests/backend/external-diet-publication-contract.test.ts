import assert from 'node:assert/strict';
import test from 'node:test';
import { externalPlanPublicationSchema } from '../../backend/src/modules/external-consultants/external-consultant-access.routes.js';
import { invalidExternalFoodReferences } from '../../backend/src/modules/external-consultants/external-diet-plan.store.js';
import { commonFoodCatalogue, governedCommonFoodCatalogue, isPublishableGovernedFoodSnapshot } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';

const emptyMeal = { window: '', focus: '', options: [] };
const producerPayload = {
  externalPlanId: 'plan-1',
  externalVersion: '2',
  consultantId: 'consultant-1',
  consultantName: 'consultant-1',
  practiceName: 'tenant-1',
  publishedAtISO: '2026-11-08T12:47:59.000Z',
  content: {
    nutritionSnapshot: {
      client: 'client-1', age: null, gender: null, goals: [], healthConditions: [],
      dietPreference: null, allergies: [], lifestyleSummary: '', personalisedPlanFocus: '',
      programmeName: 'Reviewed plan', preparedBy: 'consultant-1',
    },
    dailyTargets: {
      calories: 1800, protein: 100, carbohydrates: null, fat: null, fibre: null,
      hydration: null, movement: '',
    },
    mealPlan: {
      earlyMorning: emptyMeal,
      breakfast: { ...emptyMeal, options: [{
        id: 'option-1', slot: 1, meal: 'Poha', portion: '1 bowl', prepNote: '',
        approxKcal: 320, proteinGrams: 14, carbsGrams: 48, fatGrams: 8, fibreGrams: 6,
        sourceType: 'verified_library', isApproved: true,
        components: [{
          id: 'component-1', foodId: 'food-1', foodVersion: 1, servingId: 'serving-1',
          servingVersion: 1, sourceMappingId: 'USDA_FDC:123', componentName: 'Poha', quantity: 100,
          quantityUnit: 'g', householdLabel: '1 bowl', canonicalGrams: 100,
          calories: 320, proteinGrams: 14, carbsGrams: 48, fatGrams: 8, fibreGrams: 6,
          locked: true,
        }],
      }] },
      midMorningSnack: emptyMeal, lunch: emptyMeal, eveningSnack: emptyMeal,
      dinner: emptyMeal, bedtimeNutrition: emptyMeal,
    },
    hydrationRhythm: [], weeklySuccessGuide: [], smartSubstitutions: [],
    supplementsAndClinicalNotes: [],
  },
};

test('accepts the exact Practice Operations publication payload with canonical UTC Z time', () => {
  const serialized = JSON.stringify(producerPayload);
  const parsed = externalPlanPublicationSchema.safeParse(JSON.parse(serialized));
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.flatten()));
});

test('accepts the immutable food identity evidence emitted by Practice Operations', () => {
  const parsed = externalPlanPublicationSchema.safeParse(producerPayload);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.flatten()));
  if (!parsed.success) return;
  const component = parsed.data.content.mealPlan.breakfast.options[0].components?.[0];
  assert.deepEqual(component && {
    foodVersion: component.foodVersion,
    servingId: component.servingId,
    servingVersion: component.servingVersion,
    sourceMappingId: component.sourceMappingId,
  }, { foodVersion: 1, servingId: 'serving-1', servingVersion: 1, sourceMappingId: 'USDA_FDC:123' });
});

test('publishes a historically generated active food only with exact immutable evidence', () => {
  const historical = commonFoodCatalogue.find((food) => food.id === 'BATCH0_277');
  assert.ok(historical, 'Hazelnuts historical catalogue identity must remain auditable');
  assert.equal(governedCommonFoodCatalogue.some((food) => food.id === historical.id), false);
  const serving = historical.servings.find((item) => item.active);
  assert.ok(serving);
  const evidence = {
    foodId: historical.id, foodVersion: historical.version, servingId: serving.id,
    servingVersion: serving.version, sourceMappingId: historical.sourceMappingId,
  };
  assert.equal(isPublishableGovernedFoodSnapshot(evidence), true);
  assert.equal(isPublishableGovernedFoodSnapshot({ ...evidence, sourceMappingId: 'UNRELATED:1' }), false);
  assert.equal(isPublishableGovernedFoodSnapshot({ ...evidence, servingId: 'missing-serving' }), false);
});

test('recognises every historical canonical identity persisted in the affected approved snapshot', () => {
  const persistedFoodIds = [
    'BATCH0_33', 'BATCH0_42', 'BATCH0_44', 'BATCH0_58', 'BATCH0_69', 'BATCH0_79',
    'BATCH0_82', 'BATCH0_84', 'BATCH0_103', 'BATCH0_104', 'BATCH0_108', 'BATCH0_109',
    'BATCH0_141', 'BATCH0_182', 'BATCH0_183', 'BATCH0_184', 'BATCH0_185', 'BATCH0_187',
    'BATCH0_198', 'BATCH0_199', 'BATCH0_200', 'BATCH0_203', 'BATCH0_204', 'BATCH0_206',
    'BATCH0_218', 'BATCH0_273', 'BATCH0_274', 'BATCH0_275', 'BATCH0_276', 'BATCH0_277',
    'BATCH0_278', 'BATCH0_279',
  ];
  for (const foodId of persistedFoodIds) {
    const food = commonFoodCatalogue.find((item) => item.id === foodId);
    assert.ok(food, `${foodId} must remain traceable in the versioned catalogue`);
    assert.equal(food.active, true, `${foodId} must not be withdrawn`);
    assert.equal(food.clientConsumable, true, `${foodId} must remain client-consumable`);
    const serving = food.servings.find((item) => item.active);
    assert.ok(serving, `${foodId} must retain an active serving identity`);
    assert.equal(isPublishableGovernedFoodSnapshot({
      foodId: food.id,
      foodVersion: food.version,
      servingId: serving.id,
      servingVersion: serving.version,
      sourceMappingId: food.sourceMappingId,
    }), true, `${foodId} exact immutable snapshot must be publishable`);
  }
});

test('retains current governed and CF identities without an internal UUID mapping', () => {
  const current = governedCommonFoodCatalogue.find((food) => food.id.startsWith('CF_'))
    ?? governedCommonFoodCatalogue.find((food) => food.active && food.clientConsumable);
  assert.ok(current);
  assert.equal(isPublishableGovernedFoodSnapshot({ foodId: current.id }), true);
  assert.equal(isPublishableGovernedFoodSnapshot({
    foodId: current.id, foodVersion: null, servingId: null, servingVersion: null, sourceMappingId: null,
  }), true);
});

test('continues to reject an exact snapshot for a non-client-consumable catalogue record', () => {
  const withdrawn = commonFoodCatalogue.find((food) => food.active && !food.clientConsumable);
  assert.ok(withdrawn, 'catalogue fixture must include a non-client-consumable record');
  const serving = withdrawn.servings.find((item) => item.active);
  assert.ok(serving);
  assert.equal(isPublishableGovernedFoodSnapshot({
    foodId: withdrawn.id,
    foodVersion: withdrawn.version,
    servingId: serving.id,
    servingVersion: serving.version,
    sourceMappingId: withdrawn.sourceMappingId,
  }), false);
});

test('reports mixed valid and invalid foods without weakening publication verification', () => {
  const current = governedCommonFoodCatalogue.find((food) => food.active && food.clientConsumable);
  assert.ok(current);
  const parsed = structuredClone(producerPayload);
  parsed.content.mealPlan.breakfast.options[0].components = [
    { ...parsed.content.mealPlan.breakfast.options[0].components[0], foodId: current.id,
      foodVersion: undefined, servingId: undefined, servingVersion: undefined, sourceMappingId: undefined },
    { ...parsed.content.mealPlan.breakfast.options[0].components[0], id: 'unsafe', foodId: 'WITHDRAWN_OR_UNKNOWN' },
  ];
  const invalid = invalidExternalFoodReferences(parsed.content as never);
  assert.deepEqual(invalid, [{ foodId: 'WITHDRAWN_OR_UNKNOWN', displayName: 'Poha', mealHead: 'breakfast' }]);
});

test('continues to reject the non-canonical offset timestamp emitted by the old producer', () => {
  const parsed = externalPlanPublicationSchema.safeParse({
    ...producerPayload,
    publishedAtISO: '2026-11-08T12:47:59+00:00',
  });
  assert.equal(parsed.success, false);
});
