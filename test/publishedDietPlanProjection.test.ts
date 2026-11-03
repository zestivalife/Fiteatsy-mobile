import { PublishedNutritionPlan } from '../src/types';
import { CLIENT_DIET_MEALS, projectPublishedDietPlan } from '../src/utils/publishedDietPlan';

const baseContent = {
  nutritionSnapshot: {
    client: 'Synthetic Client', age: 30, gender: 'Female', goals: [], healthConditions: [],
    dietPreference: 'Vegetarian', allergies: [], lifestyleSummary: '', personalisedPlanFocus: 'Consistency',
    programmeName: 'Strength Plan', preparedBy: 'QA Dietitian',
  },
  dailyTargets: { calories: 1900, protein: 110, carbohydrates: 220, fat: 60, hydration: 2.5, movement: 'Daily walk' },
  mealPlan: Object.fromEntries(CLIENT_DIET_MEALS.map(({ key }) => [key, { window: '', focus: '', options: [] }])),
  hydrationRhythm: [], weeklySuccessGuide: ['Follow meal timings'], smartSubstitutions: [],
  supplementsAndClinicalNotes: [{ supplement: '', dose: '', timing: '', duration: '', note: 'Consultant guidance' }],
};

const plan = {
  plan: { id: 'plan-1', templateVersion: 'v1', planStatus: 'published', publishedAtISO: '2026-11-03T10:00:00.000Z', approvedAtISO: '2026-11-03T09:00:00.000Z' },
  version: {
    id: 'version-2', versionNumber: 2, lifecycleStatus: 'published', contentSummary: { calories: 1900, protein: 110, hydration: 2.5, focusAreas: [] },
    content: baseContent,
    commonFoodOptions: CLIENT_DIET_MEALS.flatMap(({ head }, mealIndex) => Array.from({ length: 6 }, (_, optionIndex) => ({
      type: 'COMBINATION' as const,
      id: `${head}-${optionIndex}`,
      mealHead: head,
      summary: `Option ${optionIndex + 1}`,
      components: [{ name: `Food ${mealIndex + 1}.${optionIndex + 1}`, serving: '100 g', multiplier: 1 }],
      nutrition: { kcal: 200 + optionIndex, protein: 10, carbohydrate: 25, fat: 6 },
    }))),
  },
  today: { todaysMeals: [], consultantNotes: [], hydrationRhythm: [], substitutions: [], weeklySuccessGuide: [], dailyTargets: baseContent.dailyTargets },
} as unknown as PublishedNutritionPlan;

describe('published consultant diet plan projection', () => {
  it('projects the exact published version into seven client meal sections with at most five alternatives', () => {
    const projected = projectPublishedDietPlan(plan);
    expect(projected.planName).toBe('Strength Plan');
    expect(projected.consultantName).toBe('QA Dietitian');
    expect(projected.active).toBe(true);
    expect(projected.targets).toEqual({ calories: 1900, protein: 110, carbohydrates: 220, fat: 60 });
    expect(Object.keys(projected.meals)).toHaveLength(7);
    for (const { key } of CLIENT_DIET_MEALS) expect(projected.meals[key]).toHaveLength(5);
    expect(projected.meals.earlyMorning[0]).toMatchObject({ name: 'Food 1.1', serving: '1 × 100 g', calories: 200, protein: 10, carbohydrates: 25, fat: 6 });
  });

  it('never projects draft content as active', () => {
    const draft = { ...plan, plan: { ...plan.plan, planStatus: 'draft' as const } };
    expect(projectPublishedDietPlan(draft).active).toBe(false);
  });
});
