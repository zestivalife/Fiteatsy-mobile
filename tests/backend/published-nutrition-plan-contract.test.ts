import test from 'node:test';
import assert from 'node:assert/strict';
import type { NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';
import { sanitizePublishedNutritionPlanContent } from '../../backend/src/modules/nutrition/nutrition.service.js';

const baseContent: NutritionPlanContent = {
  nutritionSnapshot: {
    client: 'Sumit',
    age: 38,
    gender: 'Male',
    goals: ['Better Energy'],
    healthConditions: ['Borderline cholesterol'],
    dietPreference: 'Eggetarian',
    allergies: ['Shellfish'],
    lifestyleSummary: 'Moderately active',
    personalisedPlanFocus: 'Improve recovery rhythm',
    programmeName: 'Better Energy Recovery Program',
    preparedBy: 'Consultant',
  },
  dailyTargets: {
    calories: 2100,
    protein: 140,
    hydration: 2.9,
    movement: '7000 steps',
  },
  mealPlan: {
    earlyMorning: {
      window: '6:30 AM',
      focus: 'Hydration start',
      options: [],
      availableOptions: [],
    },
    breakfast: {
      window: '8:00 AM',
      focus: 'Protein-first breakfast',
      options: [
        {
          id: 'selected-breakfast-2',
          slot: 2,
          meal: 'Greek curd bowl with nuts and berries',
          portion: '1 bowl',
          prepNote: 'Selected by consultant',
          approxKcal: 320,
          proteinGrams: 22,
          sourceType: 'verified_library',
        },
        {
          id: 'selected-breakfast-1',
          slot: 1,
          meal: 'Egg bhurji with multigrain toast',
          portion: '1 plate',
          prepNote: 'Selected by consultant',
          approxKcal: 390,
          proteinGrams: 24,
          sourceType: 'verified_library',
        },
      ],
      availableOptions: [
        {
          id: 'selected-breakfast-1',
          slot: 1,
          meal: 'Egg bhurji with multigrain toast',
          portion: '1 plate',
          prepNote: 'Visible in consultant editor only',
          approxKcal: 390,
          proteinGrams: 24,
          sourceType: 'verified_library',
        },
        {
          id: 'available-breakfast-3',
          slot: 3,
          meal: 'Paneer and egg breakfast wrap',
          portion: '1 wrap',
          prepNote: 'Should not reach client payload until selected',
          approxKcal: 410,
          proteinGrams: 26,
          sourceType: 'verified_library',
        },
      ],
    },
    midMorningSnack: {
      window: '11:00 AM',
      focus: 'Steady appetite',
      options: [],
      availableOptions: [],
    },
    lunch: {
      window: '1:30 PM',
      focus: 'Balanced lunch',
      options: [
        {
          id: 'selected-lunch-3',
          slot: 3,
          meal: 'Chicken roti curd thali',
          portion: '1 thali',
          prepNote: 'Selected third',
          approxKcal: 563,
          proteinGrams: 41,
          sourceType: 'verified_library',
        },
        {
          id: 'selected-lunch-1',
          slot: 1,
          meal: 'Fish curry millet plate',
          portion: '1 plate',
          prepNote: 'Selected first',
          approxKcal: 555,
          proteinGrams: 38,
          sourceType: 'verified_library',
        },
        {
          id: 'selected-lunch-2',
          slot: 2,
          meal: 'Chicken dal rice plate',
          portion: '1 plate',
          prepNote: 'Selected second',
          approxKcal: 577,
          proteinGrams: 52,
          sourceType: 'verified_library',
        },
      ],
      availableOptions: [
        {
          id: 'selected-lunch-1',
          slot: 1,
          meal: 'Fish curry millet plate',
          portion: '1 plate',
          prepNote: 'Consultant option',
          approxKcal: 555,
          proteinGrams: 38,
          sourceType: 'verified_library',
        },
        {
          id: 'selected-lunch-2',
          slot: 2,
          meal: 'Chicken dal rice plate',
          portion: '1 plate',
          prepNote: 'Consultant option',
          approxKcal: 577,
          proteinGrams: 52,
          sourceType: 'verified_library',
        },
        {
          id: 'selected-lunch-3',
          slot: 3,
          meal: 'Chicken roti curd thali',
          portion: '1 thali',
          prepNote: 'Consultant option',
          approxKcal: 563,
          proteinGrams: 41,
          sourceType: 'verified_library',
        },
        {
          id: 'available-lunch-4',
          slot: 4,
          meal: 'Lean mutton and vegetable plate',
          portion: '1 plate',
          prepNote: 'Available but not selected',
          approxKcal: 555,
          proteinGrams: 34,
          sourceType: 'verified_library',
        },
      ],
    },
    eveningSnack: {
      window: '5:00 PM',
      focus: 'Avoid evening crash',
      options: [],
      availableOptions: [],
    },
    dinner: {
      window: '8:00 PM',
      focus: 'Lighter recovery dinner',
      options: [
        {
          id: 'selected-dinner-1',
          slot: 1,
          meal: 'Fish and vegetable soup dinner',
          portion: '1 serving',
          prepNote: 'Selected by consultant',
          approxKcal: 281,
          proteinGrams: 35,
          sourceType: 'verified_library',
        },
      ],
      availableOptions: [
        {
          id: 'selected-dinner-1',
          slot: 1,
          meal: 'Fish and vegetable soup dinner',
          portion: '1 serving',
          prepNote: 'Selected by consultant',
          approxKcal: 281,
          proteinGrams: 35,
          sourceType: 'verified_library',
        },
        {
          id: 'available-dinner-2',
          slot: 2,
          meal: 'Grilled chicken with vegetables',
          portion: '1 plate',
          prepNote: 'Available but not selected',
          approxKcal: 348,
          proteinGrams: 42,
          sourceType: 'verified_library',
        },
      ],
    },
    bedtimeNutrition: {
      window: '10:00 PM',
      focus: 'Sleep support',
      options: [],
      availableOptions: [],
    },
  },
  hydrationRhythm: [],
  weeklySuccessGuide: ['Keep protein distributed across the day.'],
  smartSubstitutions: [],
  supplementsAndClinicalNotes: [],
};

test('sanitizePublishedNutritionPlanContent removes consultant-only available options and preserves selected ordering', () => {
  const sanitized = sanitizePublishedNutritionPlanContent(baseContent);

  assert.equal('availableOptions' in sanitized.mealPlan.breakfast, false);
  assert.equal('availableOptions' in sanitized.mealPlan.lunch, false);
  assert.equal('availableOptions' in sanitized.mealPlan.dinner, false);

  assert.equal(sanitized.mealPlan.breakfast.options.length, 2);
  assert.equal(sanitized.mealPlan.lunch.options.length, 3);
  assert.equal(sanitized.mealPlan.dinner.options.length, 1);

  assert.equal(sanitized.mealPlan.breakfast.options[0].slot, 1);
  assert.equal(sanitized.mealPlan.breakfast.options[1].slot, 2);
  assert.equal(sanitized.mealPlan.breakfast.options[0].meal, 'Greek curd bowl with nuts and berries');
  assert.equal(sanitized.mealPlan.breakfast.options[1].meal, 'Egg bhurji with multigrain toast');

  assert.deepEqual(
    sanitized.mealPlan.lunch.options.map((option) => option.meal),
    ['Chicken roti curd thali', 'Fish curry millet plate', 'Chicken dal rice plate'],
  );
  assert.equal(
    sanitized.mealPlan.lunch.options.some((option) => option.meal === 'Lean mutton and vegetable plate'),
    false,
  );

  assert.equal(baseContent.mealPlan.lunch.availableOptions?.length, 4);
  assert.equal(baseContent.mealPlan.breakfast.availableOptions?.[1].meal, 'Paneer and egg breakfast wrap');
});
