jest.mock('../src/services/apiClient', () => ({
  ApiClientError: Error,
  apiFetch: jest.fn(),
}));
jest.mock('../src/services/externalConsultantService', () => ({
  listExternalConsultants: jest.fn(), getExternalDietPlans: jest.fn(),
}));

import { externalPlanToNutritionExperience } from '../src/services/externalNutritionExperience';
import type { ExternalDietPlan } from '../src/services/externalConsultantService';

const publication: ExternalDietPlan = {
  id: 'publication-7', plan_id: 'plan-1', plan_version: 7, title: 'Consultant plan',
  status: 'PUBLISHED', published_at: '2026-11-07T10:00:00.000Z', is_active: true,
  content: {
    contractVersion: 'EXTERNAL_DIET_PLAN_V1', calculationAuthority: 'FITEATSY_GOVERNED_COMMON_FOOD',
    plan: { id: 'plan-1', version: 7, title: 'Consultant plan', status: 'PUBLISHED', publishedAt: '2026-11-07T10:00:00.000Z' },
    targets: { calories: 1800, protein: 100 }, instructions: ['Prefer freshly prepared meals.'],
    mealOptions: [
      { id: 'breakfast-1', mealHead: 'BREAKFAST', title: 'Poha + curd', serving: '1 bowl · 100 g',
        calculationStatus: 'AUTHORITATIVELY_RESOLVED', nutrition: { kcal: 320, protein: 14, carbohydrate: 48, fat: 8, fibre: 6 } },
      { id: 'dinner-1', mealHead: 'DINNER', title: 'Roti + dal + sabji', serving: '2 roti · 1 bowl · 1 bowl',
        calculationStatus: 'AUTHORITATIVELY_RESOLVED', nutrition: { kcal: 510, protein: 22, carbohydrate: 72, fat: 12, fibre: 11 } },
    ],
  },
};

test('exact active consultant publication renders as a seven-meal read-only Nutrition experience', () => {
  const result = externalPlanToNutritionExperience(publication, '2026-11-07');
  expect(result.delivery).toEqual({ source: 'EXTERNAL_CONSULTANT', readOnly: true, publicationId: 'publication-7' });
  expect(result.plan.id).toBe('plan-1');
  expect(result.version.versionNumber).toBe(7);
  expect(result.meals).toHaveLength(7);
  expect(result.meals.find(meal => meal.key === 'BREAKFAST')?.options[0]).toMatchObject({
    id: 'breakfast-1', meal: 'Poha + curd', portion: '1 bowl · 100 g', approxKcal: 320,
    proteinGrams: 14, carbsGrams: 48, fatGrams: 8, fibreGrams: 6,
  });
  expect(result.meals.find(meal => meal.key === 'DINNER')?.options[0].approxKcal).toBe(510);
});

test('non-authoritative or malformed consultant publications fail closed', () => {
  const malformed = { ...publication, content: { ...publication.content, calculationAuthority: 'CALLER_SUPPLIED' } };
  expect(() => externalPlanToNutritionExperience(malformed, '2026-11-07')).toThrow();
  const ungoverned = { ...publication, content: { ...publication.content,
    mealOptions: [{ id: 'x', mealHead: 'LUNCH', calculationStatus: 'UNVERIFIED', nutrition: { kcal: 1 } }] } };
  expect(() => externalPlanToNutritionExperience(ungoverned, '2026-11-07')).toThrow();
});
