import type {
  NutritionMealComponent,
  NutritionMealRecommendationSet,
  NutritionMealSlot,
  NutritionMealTarget,
} from '../platform/platform.types.js';

export type NutritionVector = {
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  fibreGrams?: number | null;
};

export type FoodMasterRecord = {
  id: string;
  canonicalName: string;
  displayName: string;
  referenceQuantity: number;
  referenceUnit: string;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  fibreGrams?: number | null;
  cuisineTags?: string[];
  dietaryTags?: string[];
  allergenTags?: string[];
  micronutrients?: Record<string, number | null>;
  sourceMetadata?: Record<string, unknown>;
  verificationStatus: 'verified' | 'seed' | 'draft';
};

export type PortionMasterRecord = {
  id: string;
  foodId: string;
  label: string;
  quantity: number;
  unit: string;
  canonicalGrams: number | null;
};

export type MealVariantRecord = {
  id: string;
  mealKey: string;
  name: string;
  description?: string | null;
  cuisineTags?: string[];
  dietaryTags?: string[];
  allergenTags?: string[];
  sourceType: 'verified_library' | 'consultant_custom' | 'template_variant';
  nutritionTotals?: Record<string, number | null>;
  sourceMetadata?: Record<string, unknown>;
  components: NutritionMealComponent[];
};

const round = (value: number | null, digits = 1) => {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const sumNullable = (values: Array<number | null | undefined>) => {
  const present = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!present.length) return null;
  return present.reduce((total, value) => total + value, 0);
};

export const resolvePortionMasterQuantity = (
  portion: PortionMasterRecord | null,
  multiplier = 1,
) => {
  if (!portion || !Number.isFinite(multiplier) || multiplier <= 0) return null;
  if (portion.canonicalGrams == null || !Number.isFinite(portion.canonicalGrams)) return null;
  return round(portion.canonicalGrams * multiplier, 1);
};

export const scaleNutritionVector = (
  reference: NutritionVector,
  actualQuantity: number | null,
  referenceQuantity: number | null,
): NutritionVector => {
  if (
    actualQuantity == null ||
    referenceQuantity == null ||
    !Number.isFinite(actualQuantity) ||
    !Number.isFinite(referenceQuantity) ||
    referenceQuantity <= 0
  ) {
    return {
      calories: null,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      fibreGrams: null,
    };
  }
  const factor = actualQuantity / referenceQuantity;
  return {
    calories: round(reference.calories == null ? null : reference.calories * factor, 1),
    proteinGrams: round(reference.proteinGrams == null ? null : reference.proteinGrams * factor, 1),
    carbsGrams: round(reference.carbsGrams == null ? null : reference.carbsGrams * factor, 1),
    fatGrams: round(reference.fatGrams == null ? null : reference.fatGrams * factor, 1),
    fibreGrams: round(reference.fibreGrams == null ? null : reference.fibreGrams * factor, 1),
  };
};

export const calculateMealComponentNutrition = (
  food: FoodMasterRecord,
  quantity: number | null,
  canonicalQuantityOverride?: number | null,
): NutritionMealComponent => {
  const canonicalQuantity = canonicalQuantityOverride ?? quantity;
  const scaled = scaleNutritionVector(
    {
      calories: food.calories,
      proteinGrams: food.proteinGrams,
      carbsGrams: food.carbsGrams,
      fatGrams: food.fatGrams,
      fibreGrams: food.fibreGrams,
    },
    canonicalQuantity,
    food.referenceQuantity,
  );
  return {
    foodId: food.id,
    componentName: food.displayName,
    quantity,
    quantityUnit: food.referenceUnit,
    canonicalGrams: canonicalQuantity,
    calories: scaled.calories,
    proteinGrams: scaled.proteinGrams,
    carbsGrams: scaled.carbsGrams,
    fatGrams: scaled.fatGrams,
    fibreGrams: scaled.fibreGrams,
  };
};

export const calculateMealNutritionTotals = (components: NutritionMealComponent[]): NutritionVector => ({
  calories: round(sumNullable(components.map((component) => component.calories)), 1),
  proteinGrams: round(sumNullable(components.map((component) => component.proteinGrams)), 1),
  carbsGrams: round(sumNullable(components.map((component) => component.carbsGrams)), 1),
  fatGrams: round(sumNullable(components.map((component) => component.fatGrams)), 1),
  fibreGrams: round(sumNullable(components.map((component) => component.fibreGrams)), 1),
});

const band = (value: number | null, toleranceFraction: number) => {
  if (value == null || !Number.isFinite(value)) {
    return { min: null, max: null };
  }
  return {
    min: round(value * (1 - toleranceFraction), 0),
    max: round(value * (1 + toleranceFraction), 0),
  };
};

export const deriveMealTargets = (input: {
  caloriesTarget: number | null;
  proteinTargetGrams: number | null;
}): Record<string, NutritionMealTarget> => {
  const calories = input.caloriesTarget ?? null;
  const protein = input.proteinTargetGrams ?? null;
  const allocation = {
    earlyMorning: 0.08,
    breakfast: 0.22,
    midMorningSnack: 0.1,
    lunch: 0.26,
    eveningSnack: 0.1,
    dinner: 0.18,
    bedtimeNutrition: 0.06,
  } as const;

  return Object.fromEntries(
    Object.entries(allocation).map(([mealKey, fraction]) => {
      const calorieTarget = calories == null ? null : Math.round(calories * fraction);
      const proteinTarget = protein == null ? null : Math.round(protein * fraction);
      return [
        mealKey,
        {
          calories: calorieTarget,
          proteinGrams: proteinTarget,
          caloriesBand: band(calorieTarget, 0.1),
          proteinBand: band(proteinTarget, 0.15),
          allocationBasis: 'Derived from approved daily energy and protein targets using the current Fiteatsy planning split.',
        } satisfies NutritionMealTarget,
      ];
    }),
  );
};

const scoreVariance = (target: number | null, actual: number | null) => {
  if (target == null || actual == null || target <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(actual - target) / target;
};

export const classifyMealMatch = (target: NutritionMealTarget | undefined, totals: NutritionVector) => {
  if (!target || target.calories == null || target.proteinGrams == null) return 'outside_target' as const;
  const calorieVariance = scoreVariance(target.calories, totals.calories);
  const proteinVariance = scoreVariance(target.proteinGrams, totals.proteinGrams);
  const composite = (calorieVariance + proteinVariance) / 2;
  if (composite <= 0.05) return 'best_match' as const;
  if (composite <= 0.12) return 'good_match' as const;
  if (composite <= 0.2) return 'acceptable' as const;
  return 'outside_target' as const;
};

export const mealVariantToSlot = (
  variant: MealVariantRecord,
  target: NutritionMealTarget | undefined,
  slot: number,
): NutritionMealSlot => {
  const totals = calculateMealNutritionTotals(variant.components);
  return {
    id: variant.id,
    slot,
    meal: variant.name,
    portion:
      variant.components
        .map((component) => component.householdLabel || (component.quantity != null ? `${component.quantity} ${component.quantityUnit}` : component.quantityUnit))
        .filter(Boolean)
        .join(' + ') || 'Consultant-defined portion',
    prepNote: variant.description || 'Consultant-reviewed meal variant.',
    approxKcal: totals.calories,
    proteinGrams: totals.proteinGrams,
    carbsGrams: totals.carbsGrams,
    fatGrams: totals.fatGrams,
    fibreGrams: totals.fibreGrams,
    matchClassification: classifyMealMatch(target, totals),
    sourceType: variant.sourceType,
    cuisineTags: variant.cuisineTags ?? [],
    dietaryTags: variant.dietaryTags ?? [],
    recommendationReason: target
      ? `Matched against ${target.calories ?? 'open'} kcal / ${target.proteinGrams ?? 'open'} g protein target.`
      : 'Matched against the current consultant meal target.',
    isApproved: false,
    components: variant.components,
  };
};

export const buildRecommendationSets = (
  options: NutritionMealSlot[],
): NutritionMealRecommendationSet[] => {
  const groups: NutritionMealRecommendationSet[] = [];
  const bestMatch = options.filter((option) => option.matchClassification === 'best_match').map((option) => option.id).filter(Boolean) as string[];
  const goodMatch = options.filter((option) => option.matchClassification === 'good_match').map((option) => option.id).filter(Boolean) as string[];
  const highProtein = options
    .filter((option) => (option.proteinGrams ?? 0) >= 20)
    .map((option) => option.id)
    .filter(Boolean) as string[];
  const consultantMeals = options
    .filter((option) => option.sourceType === 'consultant_custom')
    .map((option) => option.id)
    .filter(Boolean) as string[];

  if (bestMatch.length) {
    groups.push({ key: 'best_match', label: 'Best Match', description: 'Closest calorie and protein fit.', optionIds: bestMatch });
  }
  if (goodMatch.length) {
    groups.push({ key: 'good_match', label: 'Good Match', description: 'Suitable options within the approved tolerance bands.', optionIds: goodMatch });
  }
  if (highProtein.length) {
    groups.push({ key: 'high_protein', label: 'High Protein', description: 'Options with stronger protein contribution inside the current nutrition envelope.', optionIds: highProtein });
  }
  if (consultantMeals.length) {
    groups.push({ key: 'consultant_library', label: 'Consultant Library', description: 'Consultant-created or favourited meals for this workflow.', optionIds: consultantMeals });
  }
  return groups;
};

export const findSimilarMealSlots = (
  source: NutritionMealSlot,
  options: NutritionMealSlot[],
  limit = 6,
) =>
  options
    .filter((option) => option.id && source.id && option.id !== source.id)
    .map((option) => {
      const calorieDelta = Math.abs((source.approxKcal ?? 0) - (option.approxKcal ?? 0));
      const proteinDelta = Math.abs((source.proteinGrams ?? 0) - (option.proteinGrams ?? 0));
      return {
        option,
        score: calorieDelta + proteinDelta * 4,
      };
    })
    .sort((left, right) => left.score - right.score)
    .slice(0, limit)
    .map((item) => item.option);
