const mockApiFetch = jest.fn();
class MockApiClientError extends Error {
  constructor(public code: string, message: string, public status?: number, public serverCode?: string) { super(message); }
}
jest.mock('../src/services/apiClient', () => ({ ApiClientError: MockApiClientError, apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));
const mockGetExternal = jest.fn();
jest.mock('../src/services/externalNutritionExperience', () => ({
  getActiveExternalNutritionExperience: (...args: unknown[]) => mockGetExternal(...args),
}));
jest.mock('../src/utils/nutritionDate', () => ({ nutritionDate: () => '2026-11-07' }));

const experience = (id: string) => ({
  plan: { id, templateVersion: '1', planStatus: 'PUBLISHED', publishedAtISO: null },
  version: { id: `${id}-version`, versionNumber: 1, content: { nutritionSnapshot: { programmeName: id },
    dailyTargets: { calories: 1000, protein: 50, carbohydrates: null, fat: null, fibre: null, hydration: null }, supplementsAndClinicalNotes: [] } },
  meals: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  remaining: { calories: 1000, protein: 50, carbs: null, fat: null, fibre: null }, water: { litres: 0, targetLitres: null },
  mealCount: 0, mealsFollowed: 0, outOfPlanCount: 0, skippedCount: 0, pendingCount: 0,
  plannedVsActual: { calories: { planned: 1000, actual: 0 }, mealsFollowed: { planned: 0, actual: 0 }, outOfPlan: 0, skipped: 0 },
  mealStates: [], adherence: { percent: 0, label: '' }, nutritionScore: 0, selectedDate: '2026-11-07', consultantNote: null,
});

test('canonical persisted Nutrition projection takes precedence for every active plan type', async () => {
  mockApiFetch.mockResolvedValueOnce(experience('canonical-plan'));
  const { getNutritionExperience } = require('../src/services/nutritionExperienceService');
  await expect(getNutritionExperience('2026-11-07')).resolves.toMatchObject({ plan: { id: 'canonical-plan' } });
  expect(mockGetExternal).not.toHaveBeenCalled();
});

test('direct consultant projection remains a read-only compatibility fallback when canonical ingestion is unavailable', async () => {
  mockApiFetch.mockRejectedValueOnce(new MockApiClientError('NOT_FOUND', 'none', 404, 'DIET_PLAN_NOT_FOUND'));
  mockGetExternal.mockResolvedValueOnce(experience('external-fallback'));
  const { getNutritionExperience } = require('../src/services/nutritionExperienceService');
  await expect(getNutritionExperience('2026-11-07')).resolves.toMatchObject({ plan: { id: 'external-fallback' } });
});
