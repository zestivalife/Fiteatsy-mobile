import test from 'node:test';
import assert from 'node:assert/strict';
import { NUTRITION_MEAL_SEQUENCE, type NutritionPlanContent, type NutritionMealSlot } from '../../backend/src/modules/platform/platform.types.js';
import type { FoodPreferenceProfile } from '../../backend/src/modules/nutrition/food-preferences.service.js';
import { assertDietPlanRespectsFoodPreferences, assertDietPlanReviewContentComplete, selectDiverseMealOptions } from '../../backend/src/modules/nutrition/nutrition.service.js';
import { isDietaryPatternCompatible } from '../../backend/src/modules/nutrition/nutrition.library.store.js';

const profile = (overrides: Partial<FoodPreferenceProfile> = {}): FoodPreferenceProfile => ({
  dietType: null,
  proteins: [],
  cuisines: [],
  foodsLiked: [],
  foodsDisliked: [],
  foodsAvoided: [],
  likedFoodIds: [],
  dislikedFoodIds: [],
  avoidedFoodIds: [],
  restrictions: [],
  staplePreference: null,
  dairyPreference: null,
  practicality: [],
  ...overrides,
});

const contentWith = (slot: NutritionMealSlot): NutritionPlanContent => {
  const empty = { window: '', focus: '', options: [] };
  return {
    mealPlan: {
      earlyMorning: empty,
      breakfast: { ...empty, options: [slot] },
      midMorningSnack: empty,
      lunch: empty,
      eveningSnack: empty,
      dinner: empty,
      bedtimeNutrition: empty,
    },
  } as NutritionPlanContent;
};

const slot = (meal: string, dietaryTags: string[] = [], foodId?: string): NutritionMealSlot => ({
  id: `slot-${meal}`,
  slot: 1,
  meal,
  portion: '1 serving',
  prepNote: '',
  approxKcal: 200,
  proteinGrams: 10,
  sourceType: 'verified_library',
  dietaryTags,
  components: foodId ? [{ foodId, componentName: meal, quantity: 1, unit: 'serving' }] : [],
});

test('hard avoid, restriction, allergy, intolerance and avoided IDs are enforced', () => {
  const cases = [
    [profile({ foodsAvoided: ['mushroom'] }), slot('Mushroom roti'), null],
    [profile({ restrictions: ['peanut'] }), slot('Peanut chaat'), null],
    [profile({ avoidedFoodIds: ['food-shellfish'] }), slot('Safe-looking curry', [], 'food-shellfish'), null],
    [profile(), slot('Shellfish curry'), { foodAllergies: ['shellfish'] }],
    [profile(), slot('Milk smoothie'), { foodIntolerances: ['milk'] }],
  ] as const;
  for (const [foodProfile, meal, health] of cases) {
    assert.throws(
      () => assertDietPlanRespectsFoodPreferences(contentWith(meal), foodProfile, health),
      (error: unknown) => (error as { code?: string }).code === 'DIET_PLAN_FOOD_PREFERENCE_CONFLICT',
    );
  }
});

test('dislikes are soft preferences and do not become hard exclusions', () => {
  assert.doesNotThrow(() => assertDietPlanRespectsFoodPreferences(
    contentWith(slot('Oats porridge', ['vegetarian'])),
    profile({ dietType: 'vegetarian', foodsDisliked: ['oats'] }),
    null,
  ));
});

test('dietary pattern and dairy hard constraints are enforced', () => {
  assert.equal(isDietaryPatternCompatible('vegetarian', ['non_vegetarian'], 'chicken curry'), false);
  assert.equal(isDietaryPatternCompatible('eggetarian', ['eggetarian'], 'egg bhurji'), true);
  assert.equal(isDietaryPatternCompatible('eggetarian', ['non_vegetarian'], 'chicken curry'), false);
  assert.equal(isDietaryPatternCompatible('vegan', ['vegetarian'], 'paneer tikka'), false);
  assert.equal(isDietaryPatternCompatible('vegetarian', ['vegetarian'], 'eggplant curry'), true);
  assert.throws(() => assertDietPlanRespectsFoodPreferences(
    contentWith(slot('Paneer tikka', ['vegetarian'])),
    profile({ dietType: 'vegetarian', dairyPreference: 'avoid' }),
    null,
  ));
});

test('hard restrictions match food terms, not unrelated substrings', () => {
  assert.doesNotThrow(() => assertDietPlanRespectsFoodPreferences(
    contentWith(slot('Eggplant curry', ['vegetarian'])),
    profile({ foodsAvoided: ['egg'] }),
    null,
  ));
  assert.throws(
    () => assertDietPlanRespectsFoodPreferences(
      contentWith(slot('Egg curry', ['eggetarian'])),
      profile({ dietType: 'eggetarian', foodsAvoided: ['egg'] }),
      null,
    ),
    (error: unknown) => (error as { code?: string }).code === 'DIET_PLAN_FOOD_PREFERENCE_CONFLICT',
  );
});

test('candidate selection rotates exact options across meal heads before reusing them', () => {
  const used = new Set<string>();
  const shared = slot('Shared dal', ['vegetarian'], 'food-dal');
  const breakfastOnly = slot('Breakfast oats', ['vegetarian'], 'food-oats');
  const lunchOnly = slot('Lunch beans', ['vegetarian'], 'food-beans');

  assert.deepEqual(
    selectDiverseMealOptions([shared, breakfastOnly], used, 1).map((option) => option.meal),
    ['Shared dal'],
  );
  assert.deepEqual(
    selectDiverseMealOptions([shared, lunchOnly], used, 1).map((option) => option.meal),
    ['Lunch beans'],
  );
});

test('candidate selection prefers distinct recipe families before portion variants', () => {
  const used = new Set<string>();
  const candidates = [
    slot('Yoghurt chaat — light portion', ['vegetarian'], 'food-yoghurt'),
    slot('Yoghurt chaat — standard portion', ['vegetarian'], 'food-yoghurt'),
    slot('Vegetable poha — standard portion', ['vegetarian'], 'food-poha'),
  ];

  assert.deepEqual(
    selectDiverseMealOptions(candidates, used, 2).map((option) => option.meal),
    ['Yoghurt chaat — light portion', 'Vegetable poha — standard portion'],
  );
});

test('an empty verified catalogue result stays empty instead of fabricating a fallback', () => {
  assert.deepEqual(selectDiverseMealOptions([], new Set<string>()), []);
});

test('canonical nutrition plan retains exactly seven ordered meal heads', () => {
  assert.deepEqual(NUTRITION_MEAL_SEQUENCE, [
    'earlyMorning',
    'breakfast',
    'midMorningSnack',
    'lunch',
    'eveningSnack',
    'dinner',
    'bedtimeNutrition',
  ]);
});

test('safe compatible food remains valid', () => {
  assert.doesNotThrow(() => assertDietPlanRespectsFoodPreferences(
    contentWith(slot('Vegetable roti wrap', ['vegetarian'])),
    profile({ dietType: 'vegetarian', cuisines: ['Maharashtrian'], staplePreference: 'roti' }),
    null,
  ));
});

const completeReviewContent = (): NutritionPlanContent => {
  const mealPlan = Object.fromEntries(NUTRITION_MEAL_SEQUENCE.map((mealKey, index) => [
    mealKey,
    {
      window: `${index + 6}:00`,
      focus: mealKey,
      options: Array.from({ length: 5 }, (_, optionIndex) => ({
        ...slot(`${mealKey} option ${optionIndex + 1}`, ['vegetarian'], `component-${mealKey}-${optionIndex + 1}`),
        id: `variant-${mealKey}-${optionIndex + 1}`,
        slot: optionIndex + 1,
      })),
    },
  ])) as NutritionPlanContent['mealPlan'];
  return { mealPlan } as NutritionPlanContent;
};

test('review content requires exactly five saved options for every canonical meal head', () => {
  const content = completeReviewContent();
  assert.doesNotThrow(() => assertDietPlanReviewContentComplete(content));
  content.mealPlan.lunch.options = [];
  assert.throws(
    () => assertDietPlanReviewContentComplete(content),
    (error: unknown) => (
      (error as { code?: string; message?: string }).code === 'DIET_PLAN_REVIEW_CONTENT_INCOMPLETE'
      && (error as { message?: string }).message?.includes('lunch') === true
    ),
  );
});

test('review content rejects template placeholders, duplicates and more than five selections', () => {
  const templateContent = completeReviewContent();
  templateContent.mealPlan.breakfast.options[0].sourceType = 'generated_template';
  assert.throws(() => assertDietPlanReviewContentComplete(templateContent));

  const duplicateContent = completeReviewContent();
  duplicateContent.mealPlan.dinner.options.push({ ...duplicateContent.mealPlan.dinner.options[0], slot: 2 });
  assert.throws(() => assertDietPlanReviewContentComplete(duplicateContent));

  const overflowContent = completeReviewContent();
  overflowContent.mealPlan.earlyMorning.options = Array.from({ length: 6 }, (_, index) => ({
    ...slot(`Distinct option ${index + 1}`, ['vegetarian'], `food-distinct-${index + 1}`),
    slot: index + 1,
  }));
  assert.throws(() => assertDietPlanReviewContentComplete(overflowContent));
});

test('review content rejects raw foods, missing canonical servings and incomplete nutrition', () => {
  const rawFood = completeReviewContent();
  rawFood.mealPlan.lunch.options[0] = {
    ...rawFood.mealPlan.lunch.options[0],
    id: 'food:raw-ingredient',
  };
  assert.throws(() => assertDietPlanReviewContentComplete(rawFood), /client-consumable recipe or meal variant/);

  const missingServing = completeReviewContent();
  missingServing.mealPlan.breakfast.options[0] = {
    ...missingServing.mealPlan.breakfast.options[0],
    portion: 'Consultant-defined portion',
  };
  assert.throws(() => assertDietPlanReviewContentComplete(missingServing), /canonical serving metadata/);

  const missingProtein = completeReviewContent();
  missingProtein.mealPlan.dinner.options[0] = {
    ...missingProtein.mealPlan.dinner.options[0],
    proteinGrams: null,
  };
  assert.throws(() => assertDietPlanReviewContentComplete(missingProtein), /calories and protein/);
});
