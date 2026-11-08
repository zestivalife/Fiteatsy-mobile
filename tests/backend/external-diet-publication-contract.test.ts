import assert from 'node:assert/strict';
import test from 'node:test';
import { externalPlanPublicationSchema } from '../../backend/src/modules/external-consultants/external-consultant-access.routes.js';

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
          id: 'component-1', foodId: 'food-1', componentName: 'Poha', quantity: 100,
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

test('continues to reject the non-canonical offset timestamp emitted by the old producer', () => {
  const parsed = externalPlanPublicationSchema.safeParse({
    ...producerPayload,
    publishedAtISO: '2026-11-08T12:47:59+00:00',
  });
  assert.equal(parsed.success, false);
});
