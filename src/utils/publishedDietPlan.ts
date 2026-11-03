import { NutritionMealOption, PublishedNutritionPlan } from '../types';

export const CLIENT_DIET_MEALS = [
  { key: 'earlyMorning', head: 'EARLY_MORNING', label: 'Early Morning' },
  { key: 'breakfast', head: 'BREAKFAST', label: 'Breakfast' },
  { key: 'midMorningSnack', head: 'MID_MORNING', label: 'Mid Morning' },
  { key: 'lunch', head: 'LUNCH', label: 'Lunch' },
  { key: 'eveningSnack', head: 'EVENING_SNACK', label: 'Evening Snack' },
  { key: 'dinner', head: 'DINNER', label: 'Dinner' },
  { key: 'bedtimeNutrition', head: 'BEDTIME', label: 'Bedtime' },
] as const;

export type ClientDietMealKey = typeof CLIENT_DIET_MEALS[number]['key'];

export type ClientDietOption = {
  id: string;
  name: string;
  serving: string;
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  guidance: string | null;
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const fromLegacyOption = (option: NutritionMealOption, index: number): ClientDietOption => ({
  id: option.id ?? `legacy-${option.slot}-${index}`,
  name: option.meal,
  serving: option.portion,
  calories: finite(option.approxKcal),
  protein: finite(option.proteinGrams),
  carbohydrates: finite(option.carbsGrams),
  fat: finite(option.fatGrams),
  guidance: option.prepNote || null,
});

export const projectPublishedDietPlan = (plan: PublishedNutritionPlan) => {
  const combinations = plan.version.commonFoodOptions ?? [];
  const meals = Object.fromEntries(CLIENT_DIET_MEALS.map((definition) => {
    const commonOptions = combinations
      .filter((option) => option.mealHead === definition.head)
      .slice(0, 5)
      .map((option) => ({
        id: option.id,
        name: option.components.map((component) => component.name).filter(Boolean).join(' + ') || option.summary,
        serving: option.components
          .map((component) => `${component.multiplier} × ${component.serving}`)
          .filter(Boolean)
          .join(' · '),
        calories: finite(option.nutrition?.kcal),
        protein: finite(option.nutrition?.protein),
        carbohydrates: finite(option.nutrition?.carbohydrate),
        fat: finite(option.nutrition?.fat),
        guidance: null,
      } satisfies ClientDietOption));
    const legacy = plan.version.content.mealPlan[definition.key].options
      .slice(0, 5)
      .map(fromLegacyOption);
    return [definition.key, commonOptions.length ? commonOptions : legacy];
  })) as Record<ClientDietMealKey, ClientDietOption[]>;

  const content = plan.version.content;
  return {
    planName: content.nutritionSnapshot.programmeName || 'My Diet Plan',
    consultantName: content.nutritionSnapshot.preparedBy || 'Your consultant',
    publishedAtISO: plan.plan.publishedAtISO,
    versionNumber: plan.version.versionNumber,
    active: plan.plan.planStatus === 'published' && plan.version.lifecycleStatus === 'published',
    targets: {
      calories: content.dailyTargets.calories,
      protein: content.dailyTargets.protein,
      carbohydrates: content.dailyTargets.carbohydrates ?? null,
      fat: content.dailyTargets.fat ?? null,
    },
    meals,
    instructions: [
      ...content.weeklySuccessGuide,
      ...content.supplementsAndClinicalNotes.map((item) => item.note).filter(Boolean),
    ],
  };
};
