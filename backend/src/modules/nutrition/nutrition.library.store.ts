import { pool } from '../../db/pool.js';
import {
  calculateMealComponentNutrition,
  calculateMealNutritionTotals,
  mealVariantToSlot,
  resolvePortionMasterQuantity,
  type FoodMasterRecord,
  type MealVariantRecord,
  type PortionMasterRecord,
} from './meal-engine.js';
import type { NutritionMealSlot, NutritionMealTarget } from '../platform/platform.types.js';

type JsonRecord = Record<string, unknown>;

type NutritionFoodRow = {
  id: string;
  canonical_name: string;
  display_name: string;
  reference_quantity: number | string;
  reference_unit: string;
  calories: number | string | null;
  protein_grams: number | string | null;
  carbohydrate_grams: number | string | null;
  fat_grams: number | string | null;
  fibre_grams: number | string | null;
  cuisine_tags: string[] | null;
  dietary_tags: string[] | null;
  allergen_tags: string[] | null;
  verification_status: FoodMasterRecord['verificationStatus'];
};

type PortionRow = {
  id: string;
  food_id: string;
  portion_label: string;
  quantity: number | string;
  quantity_unit: string;
  canonical_grams: number | string | null;
};

type MealVariantRow = {
  id: string;
  meal_key: string;
  variant_name: string;
  description: string | null;
  household_label: string | null;
  cuisine_tags: string[] | null;
  dietary_tags: string[] | null;
  allergen_tags: string[] | null;
  owner_scope: 'system' | 'organisation' | 'consultant';
  consultant_id: string | null;
  verification_status: 'draft' | 'seed' | 'verified';
  source_type: MealVariantRecord['sourceType'];
};

type MealVariantComponentRow = {
  id: string;
  meal_variant_id: string;
  food_id: string | null;
  component_name: string;
  quantity: number | string | null;
  quantity_unit: string;
  household_label: string | null;
  canonical_grams: number | string | null;
  locked: boolean;
  nutrition_totals: JsonRecord | null;
  sort_order: number | string;
};

const toNumberOrNull = (value: unknown) => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTagArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];

const normalizeJsonRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};

const normalizeText = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const mapFoodRecord = (row: NutritionFoodRow): FoodMasterRecord => ({
  id: String(row.id),
  canonicalName: String(row.canonical_name),
  displayName: String(row.display_name),
  referenceQuantity: Number(row.reference_quantity),
  referenceUnit: String(row.reference_unit),
  calories: toNumberOrNull(row.calories),
  proteinGrams: toNumberOrNull(row.protein_grams),
  carbsGrams: toNumberOrNull(row.carbohydrate_grams),
  fatGrams: toNumberOrNull(row.fat_grams),
  fibreGrams: toNumberOrNull(row.fibre_grams),
  cuisineTags: normalizeTagArray(row.cuisine_tags),
  dietaryTags: normalizeTagArray(row.dietary_tags),
  allergenTags: normalizeTagArray(row.allergen_tags),
  verificationStatus: row.verification_status,
});

const mapPortionRecord = (row: PortionRow): PortionMasterRecord => ({
  id: String(row.id),
  foodId: String(row.food_id),
  label: String(row.portion_label),
  quantity: Number(row.quantity),
  unit: String(row.quantity_unit),
  canonicalGrams: toNumberOrNull(row.canonical_grams),
});

const buildComponentNutrition = (input: {
  food: FoodMasterRecord | undefined;
  component: MealVariantComponentRow;
  portionsByFoodId: Map<string, PortionMasterRecord[]>;
}) => {
  const nutritionTotals = normalizeJsonRecord(input.component.nutrition_totals);
  const explicitCalories = toNumberOrNull(nutritionTotals.calories);
  const explicitProtein = toNumberOrNull(nutritionTotals.proteinGrams ?? nutritionTotals.protein_grams);
  const explicitCarbs = toNumberOrNull(nutritionTotals.carbsGrams ?? nutritionTotals.carbohydrateGrams ?? nutritionTotals.carbohydrate_grams);
  const explicitFat = toNumberOrNull(nutritionTotals.fatGrams ?? nutritionTotals.fat_grams);
  const explicitFibre = toNumberOrNull(nutritionTotals.fibreGrams ?? nutritionTotals.fibre_grams);

  if ([explicitCalories, explicitProtein, explicitCarbs, explicitFat, explicitFibre].some((value) => value != null)) {
    return {
      id: String(input.component.id),
      foodId: input.component.food_id,
      componentName: input.component.component_name,
      quantity: toNumberOrNull(input.component.quantity),
      quantityUnit: input.component.quantity_unit,
      householdLabel: input.component.household_label,
      canonicalGrams: toNumberOrNull(input.component.canonical_grams),
      calories: explicitCalories,
      proteinGrams: explicitProtein,
      carbsGrams: explicitCarbs,
      fatGrams: explicitFat,
      fibreGrams: explicitFibre,
      locked: Boolean(input.component.locked),
    };
  }

  if (!input.food) {
    return {
      id: String(input.component.id),
      foodId: input.component.food_id,
      componentName: input.component.component_name,
      quantity: toNumberOrNull(input.component.quantity),
      quantityUnit: input.component.quantity_unit,
      householdLabel: input.component.household_label,
      canonicalGrams: toNumberOrNull(input.component.canonical_grams),
      calories: null,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      fibreGrams: null,
      locked: Boolean(input.component.locked),
    };
  }

  const portions = input.component.food_id ? input.portionsByFoodId.get(input.component.food_id) ?? [] : [];
  const selectedPortion = portions.find((portion) => normalizeText(portion.label) === normalizeText(input.component.household_label));
  const fallbackPortion = portions.find((portion) => normalizeText(portion.unit) === normalizeText(input.component.quantity_unit));
  const resolvedQuantity =
    toNumberOrNull(input.component.canonical_grams) ??
    resolvePortionMasterQuantity(selectedPortion ?? fallbackPortion ?? null, toNumberOrNull(input.component.quantity) ?? 1);

  const scaled = calculateMealComponentNutrition(input.food, toNumberOrNull(input.component.quantity), resolvedQuantity);
  return {
    ...scaled,
    id: String(input.component.id),
    quantityUnit: input.component.quantity_unit,
    householdLabel: input.component.household_label,
    locked: Boolean(input.component.locked),
  };
};

export const listVerifiedFoodMasterRecords = async () => {
  const result = await pool.query<NutritionFoodRow>(
    `
      select
        id,
        canonical_name,
        display_name,
        reference_quantity,
        reference_unit,
        calories,
        protein_grams,
        carbohydrate_grams,
        fat_grams,
        fibre_grams,
        cuisine_tags,
        dietary_tags,
        allergen_tags,
        verification_status
      from nutrition_foods
      where deleted_at is null
        and status = 'active'
        and verification_status = 'verified'
      order by lower(display_name) asc
    `,
  );

  return result.rows.map(mapFoodRecord);
};

export const listFoodPortionMasterRecords = async (foodIds?: string[]) => {
  const filters = foodIds?.length ? [foodIds] : [];
  const result = await pool.query<PortionRow>(
    `
      select
        id,
        food_id,
        portion_label,
        quantity,
        quantity_unit,
        canonical_grams
      from nutrition_food_portions
      where deleted_at is null
        and status = 'active'
        ${foodIds?.length ? 'and food_id = any($1::uuid[])' : ''}
      order by lower(portion_label) asc
    `,
    filters,
  );

  return result.rows.map(mapPortionRecord);
};

export const listEligibleMealVariantRecords = async (input: {
  mealKey?: string;
  consultantId?: string | null;
  dietPreference?: string | null;
  allergyTags?: string[];
  avoidedFoods?: string[];
  avoidedFoodIds?: string[];
  likedFoodIds?: string[];
  preferredCuisines?: string[];
  includeOutsideTarget?: boolean;
  limit?: number;
}) => {
  const resultLimit = input.limit ?? 12;
  const candidateLimit = input.preferredCuisines?.length ? Math.max(resultLimit, 120) : resultLimit;
  const params: unknown[] = [input.mealKey ?? '', input.consultantId ?? null, candidateLimit];
  const variantsResult = await pool.query<MealVariantRow>(
    `
      select
        id,
        meal_key,
        variant_name,
        description,
        household_label,
        cuisine_tags,
        dietary_tags,
        allergen_tags,
        owner_scope,
        consultant_id,
        verification_status,
        case
          when owner_scope = 'consultant' then 'consultant_custom'
          when meal_template_id is not null then 'template_variant'
          else 'verified_library'
        end as source_type
      from nutrition_meal_variants
      where deleted_at is null
        and status = 'active'
        and verification_status = 'verified'
        and ($1 = '' or meal_key = $1)
        and (
          owner_scope in ('system', 'organisation')
          or (owner_scope = 'consultant' and consultant_id = $2)
        )
      order by updated_at desc
      limit $3
    `,
    params,
  );

  if (!variantsResult.rowCount) return [] as MealVariantRecord[];

  const candidateRows = variantsResult.rows.filter((row) => {
    const dietaryTags = normalizeTagArray(row.dietary_tags).map(normalizeText);
    const allergenTags = normalizeTagArray(row.allergen_tags).map(normalizeText);
    const requestedDiet = normalizeText(input.dietPreference);
    const blockedAllergens = (input.allergyTags ?? []).map(normalizeText).filter(Boolean);
    const avoidedFoods = (input.avoidedFoods ?? []).map(normalizeText).filter(Boolean);
    const preferredCuisines = (input.preferredCuisines ?? []).map(normalizeText).filter(Boolean);

    const dietCompatible = !requestedDiet || !dietaryTags.length || dietaryTags.some((tag) => requestedDiet.includes(tag) || tag.includes(requestedDiet));
    const allergyCompatible = blockedAllergens.every((blocked) => !allergenTags.includes(blocked));
    const foodCompatible = avoidedFoods.every((blocked) => !normalizeText(row.variant_name).includes(blocked));
    const cuisineCompatible = !preferredCuisines.length || normalizeTagArray(row.cuisine_tags).some((tag) => preferredCuisines.includes(normalizeText(tag)));

    return dietCompatible && allergyCompatible && foodCompatible && cuisineCompatible;
  });

  if (!candidateRows.length) return [] as MealVariantRecord[];

  const variantIds = candidateRows.map((row) => row.id);
  const componentsResult = await pool.query<MealVariantComponentRow>(
    `
      select
        id,
        meal_variant_id,
        food_id,
        component_name,
        quantity,
        quantity_unit,
        household_label,
        canonical_grams,
        locked,
        nutrition_totals,
        sort_order
      from nutrition_meal_variant_components
      where deleted_at is null
        and meal_variant_id = any($1::uuid[])
      order by meal_variant_id asc, sort_order asc, created_at asc
    `,
    [variantIds],
  );

  const foodIds = Array.from(new Set(componentsResult.rows.map((row) => row.food_id).filter(Boolean) as string[]));
  const [foods, portions] = await Promise.all([
    foodIds.length
      ? pool.query<NutritionFoodRow>(
          `
            select
              id,
              canonical_name,
              display_name,
              reference_quantity,
              reference_unit,
              calories,
              protein_grams,
              carbohydrate_grams,
              fat_grams,
              fibre_grams,
              cuisine_tags,
              dietary_tags,
              allergen_tags,
              verification_status
            from nutrition_foods
            where deleted_at is null
              and status = 'active'
              and id = any($1::uuid[])
          `,
          [foodIds],
        )
      : Promise.resolve({ rows: [] } as { rows: NutritionFoodRow[] }),
    foodIds.length ? listFoodPortionMasterRecords(foodIds) : Promise.resolve([] as PortionMasterRecord[]),
  ]);

  const foodsById = new Map(foods.rows.map((row) => [row.id, mapFoodRecord(row)]));
  const portionsByFoodId = new Map<string, PortionMasterRecord[]>();
  portions.forEach((portion) => {
    const next = portionsByFoodId.get(portion.foodId) ?? [];
    next.push(portion);
    portionsByFoodId.set(portion.foodId, next);
  });

  const componentsByVariantId = new Map<string, ReturnType<typeof buildComponentNutrition>[]>();
  componentsResult.rows.forEach((component) => {
    const built = buildComponentNutrition({
      food: component.food_id ? foodsById.get(component.food_id) : undefined,
      component,
      portionsByFoodId,
    });
    const next = componentsByVariantId.get(component.meal_variant_id) ?? [];
    next.push(built);
    componentsByVariantId.set(component.meal_variant_id, next);
  });

  const mappedVariants = candidateRows.map((row) => ({
    id: row.id,
    mealKey: row.meal_key,
    name: row.variant_name,
    description: row.description,
    cuisineTags: normalizeTagArray(row.cuisine_tags),
    dietaryTags: normalizeTagArray(row.dietary_tags),
    allergenTags: normalizeTagArray(row.allergen_tags),
    sourceType: row.source_type,
    components: componentsByVariantId.get(row.id) ?? [],
  } satisfies MealVariantRecord));
  const likedIds = new Set(input.likedFoodIds ?? []);
  return mappedVariants
    .filter((variant) => {
    const blocked = (input.avoidedFoods ?? []).map(normalizeText).filter(Boolean);
    const blockedIds = new Set(input.avoidedFoodIds ?? []);
    return blocked.every((food) => !variant.components.some((component) => normalizeText(component.componentName).includes(food))) &&
      !variant.components.some((component) => component.foodId != null && blockedIds.has(component.foodId));
    })
    .sort((left, right) => {
      const leftMatches = left.components.filter((component) => component.foodId != null && likedIds.has(component.foodId)).length;
      const rightMatches = right.components.filter((component) => component.foodId != null && likedIds.has(component.foodId)).length;
      return rightMatches - leftMatches;
    })
    .slice(0, resultLimit);
};

export const listMealLibrarySlotsForTarget = async (input: {
  mealKey?: string;
  target: NutritionMealTarget | undefined;
  consultantId?: string | null;
  dietPreference?: string | null;
  allergyTags?: string[];
  avoidedFoods?: string[];
  avoidedFoodIds?: string[];
  likedFoodIds?: string[];
  preferredCuisines?: string[];
  includeOutsideTarget?: boolean;
  limit?: number;
}) => {
  const variants = await listEligibleMealVariantRecords(input);
  const variantSlots = variants
    .map((variant, index) => {
      const slot = mealVariantToSlot(variant, input.target, index + 1);
      const totals = calculateMealNutritionTotals(slot.components ?? []);
      return {
        ...slot,
        approxKcal: slot.approxKcal ?? totals.calories,
        proteinGrams: slot.proteinGrams ?? totals.proteinGrams,
        carbsGrams: slot.carbsGrams ?? totals.carbsGrams,
        fatGrams: slot.fatGrams ?? totals.fatGrams,
        fibreGrams: slot.fibreGrams ?? totals.fibreGrams,
      } satisfies NutritionMealSlot;
    })
    .filter((slot) => input.includeOutsideTarget || slot.matchClassification !== 'outside_target' || variants.length <= 3);

  const limit = input.limit ?? 6;
  if (variantSlots.length >= limit) return variantSlots.slice(0, limit);

  // A verified food master record is itself a valid single-food guidance option.
  // This keeps catalogue truth available even when a deployment has not yet
  // assembled that food into a multi-component meal variant.
  const requestedDiet = normalizeText(input.dietPreference);
  const blockedAllergens = (input.allergyTags ?? []).map(normalizeText).filter(Boolean);
  const avoidedFoods = (input.avoidedFoods ?? []).map(normalizeText).filter(Boolean);
  const avoidedIds = new Set(input.avoidedFoodIds ?? []);
  const preferredCuisines = (input.preferredCuisines ?? []).map(normalizeText).filter(Boolean);
  const verifiedFoods = (await listVerifiedFoodMasterRecords()).filter((food) => {
    if ([food.calories, food.proteinGrams, food.carbsGrams, food.fatGrams, food.fibreGrams].some((value) => value == null)) return false;
    if (avoidedIds.has(food.id) || avoidedFoods.some((value) => normalizeText(food.displayName).includes(value))) return false;
    if (blockedAllergens.some((value) => (food.allergenTags ?? []).map(normalizeText).includes(value))) return false;
    if (requestedDiet && (food.dietaryTags ?? []).length && !(food.dietaryTags ?? []).map(normalizeText).some((tag) => requestedDiet.includes(tag) || tag.includes(requestedDiet))) return false;
    return !preferredCuisines.length || (food.cuisineTags ?? []).map(normalizeText).some((tag) => preferredCuisines.includes(tag));
  });
  const existingIds = new Set(variantSlots.flatMap((slot) => slot.components?.flatMap((component) => component.foodId ? [component.foodId] : []) ?? []));
  const foodSlots = verifiedFoods.filter((food) => !existingIds.has(food.id)).map((food, index) => ({
    id: `food:${food.id}`,
    slot: variantSlots.length + index + 1,
    meal: food.displayName,
    portion: `${food.referenceQuantity} ${food.referenceUnit}`,
    prepNote: 'Use the verified reference serving shown.',
    approxKcal: food.calories,
    proteinGrams: food.proteinGrams,
    carbsGrams: food.carbsGrams,
    fatGrams: food.fatGrams,
    fibreGrams: food.fibreGrams,
    sourceType: 'verified_library' as const,
    recommendationReason: 'Verified food catalogue option matched to the client profile and selected context.',
    cuisineTags: food.cuisineTags,
    dietaryTags: food.dietaryTags,
    components: [{
      id: `food-component:${food.id}`,
      foodId: food.id,
      componentName: food.displayName,
      quantity: food.referenceQuantity,
      quantityUnit: food.referenceUnit,
      householdLabel: `${food.referenceQuantity} ${food.referenceUnit}`,
      canonicalGrams: food.referenceUnit.toLowerCase() === 'g' ? food.referenceQuantity : null,
      calories: food.calories,
      proteinGrams: food.proteinGrams,
      carbsGrams: food.carbsGrams,
      fatGrams: food.fatGrams,
      fibreGrams: food.fibreGrams,
      locked: true,
    }],
  } satisfies NutritionMealSlot));

  return [...variantSlots, ...foodSlots].slice(0, limit);
};
