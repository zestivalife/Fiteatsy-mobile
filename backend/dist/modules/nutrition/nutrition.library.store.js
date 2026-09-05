import { pool } from '../../db/pool.js';
import { calculateMealComponentNutrition, calculateMealNutritionTotals, mealVariantToSlot, resolvePortionMasterQuantity, } from './meal-engine.js';
const toNumberOrNull = (value) => {
    if (value == null)
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const normalizeTagArray = (value) => Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
const normalizeJsonRecord = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const normalizeNullableNutrients = (value) => Object.fromEntries(Object.entries(normalizeJsonRecord(value)).map(([key, nutrient]) => [
    key,
    nutrient == null ? null : toNumberOrNull(nutrient),
]));
const normalizeText = (value) => (value ?? '').trim().toLowerCase();
const normalizedValues = (values) => (values ?? []).map(normalizeText).filter(Boolean);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsTerm = (text, value) => new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(value)}(?:$|[^a-z0-9])`, 'i').test(text);
const containsAny = (text, values) => values.some((value) => containsTerm(text, value));
const dairyTerms = ['milk', 'curd', 'yogurt', 'yoghurt', 'paneer', 'cheese', 'butter', 'ghee', 'cream', 'whey', 'dairy'];
const animalMeatTerms = ['chicken', 'fish', 'mutton', 'meat', 'pork', 'beef', 'seafood', 'prawn', 'shrimp'];
const eggTerms = ['egg', 'eggs', 'omelette', 'omelet'];
export const isDietaryPatternCompatible = (dietPreference, dietaryTags, searchableText = '') => {
    const diet = normalizeText(dietPreference).replace(/[-\s]+/g, '_');
    if (!diet)
        return true;
    const tags = dietaryTags.map((tag) => normalizeText(tag).replace(/[-\s]+/g, '_'));
    const text = normalizeText(searchableText);
    const hasMeat = containsAny(text, animalMeatTerms) || tags.some((tag) => ['non_vegetarian', 'nonveg', 'meat', 'fish'].includes(tag));
    const hasEgg = containsAny(text, eggTerms) || tags.some((tag) => ['egg', 'eggetarian'].includes(tag));
    const hasDairy = containsAny(text, dairyTerms) || tags.includes('dairy');
    if (diet === 'vegan')
        return !hasMeat && !hasEgg && !hasDairy;
    if (diet === 'vegetarian' || diet === 'jain')
        return !hasMeat && !hasEgg;
    if (diet === 'eggetarian')
        return !hasMeat;
    return true;
};
const preferenceScore = (input, preferences) => {
    const text = normalizeText([input.name, ...input.components.map((item) => item.componentName)].join(' '));
    const ids = new Set(input.components.flatMap((item) => item.foodId ? [item.foodId] : []));
    const cuisines = (input.cuisineTags ?? []).map(normalizeText);
    let score = 0;
    score += normalizedValues(preferences.likedFoods).filter((value) => text.includes(value)).length * 12;
    score -= normalizedValues(preferences.dislikedFoods).filter((value) => text.includes(value)).length * 8;
    score += (preferences.likedFoodIds ?? []).filter((id) => ids.has(id)).length * 15;
    score -= (preferences.dislikedFoodIds ?? []).filter((id) => ids.has(id)).length * 10;
    score += normalizedValues(preferences.preferredCuisines).filter((value) => cuisines.includes(value)).length * 6;
    score += normalizedValues(preferences.preferredProteins).filter((value) => text.includes(value)).length * 5;
    const staple = normalizeText(preferences.staplePreference);
    if (staple && staple !== 'none' && staple !== 'both' && text.includes(staple))
        score += 4;
    score += normalizedValues(preferences.practicality).filter((value) => text.includes(value)).length * 2;
    return score;
};
export const selectMealVariantFamilies = (variants, familyLimit) => {
    const selectedFamilies = new Set();
    for (const variant of variants) {
        if (selectedFamilies.has(variant.canonicalFamilyId))
            continue;
        if (selectedFamilies.size >= familyLimit)
            break;
        selectedFamilies.add(variant.canonicalFamilyId);
    }
    return variants.filter((variant) => selectedFamilies.has(variant.canonicalFamilyId));
};
const mapFoodRecord = (row) => ({
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
    micronutrients: normalizeNullableNutrients(row.micronutrients),
    sourceMetadata: normalizeJsonRecord(row.source_metadata),
    verificationStatus: row.verification_status,
});
const mapPortionRecord = (row) => ({
    id: String(row.id),
    foodId: String(row.food_id),
    label: String(row.portion_label),
    quantity: Number(row.quantity),
    unit: String(row.quantity_unit),
    canonicalGrams: toNumberOrNull(row.canonical_grams),
});
const buildComponentNutrition = (input) => {
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
    const resolvedQuantity = toNumberOrNull(input.component.canonical_grams) ??
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
    const result = await pool.query(`
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
        micronutrients,
        source_metadata,
        verification_status
      from nutrition_foods
      where deleted_at is null
        and status = 'active'
        and verification_status = 'verified'
      order by lower(display_name) asc
    `);
    return result.rows.map(mapFoodRecord);
};
export const listFoodPortionMasterRecords = async (foodIds) => {
    const filters = foodIds?.length ? [foodIds] : [];
    const result = await pool.query(`
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
    `, filters);
    return result.rows.map(mapPortionRecord);
};
export const listEligibleMealVariantRecords = async (input) => {
    const familyLimit = input.limit ?? 12;
    const params = [input.mealKey ?? '', input.consultantId ?? null];
    const variantsResult = await pool.query(`
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
        nutrition_totals,
        source_metadata,
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
    `, params);
    if (!variantsResult.rowCount)
        return [];
    const candidateRows = variantsResult.rows.filter((row) => {
        const dietaryTags = normalizeTagArray(row.dietary_tags);
        const allergenTags = normalizeTagArray(row.allergen_tags).map(normalizeText);
        const blockedAllergens = (input.allergyTags ?? []).map(normalizeText).filter(Boolean);
        const avoidedFoods = (input.avoidedFoods ?? []).map(normalizeText).filter(Boolean);
        const dietCompatible = isDietaryPatternCompatible(input.dietPreference, dietaryTags, row.variant_name);
        const allergyCompatible = blockedAllergens.every((blocked) => !allergenTags.includes(blocked));
        const foodCompatible = avoidedFoods.every((blocked) => !containsTerm(normalizeText(row.variant_name), blocked));
        const dairyCompatible = normalizeText(input.dairyPreference) !== 'avoid' || !containsAny(normalizeText(row.variant_name), dairyTerms);
        return dietCompatible && allergyCompatible && foodCompatible && dairyCompatible;
    });
    if (!candidateRows.length)
        return [];
    const variantIds = candidateRows.map((row) => row.id);
    const componentsResult = await pool.query(`
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
    `, [variantIds]);
    const foodIds = Array.from(new Set(componentsResult.rows.map((row) => row.food_id).filter(Boolean)));
    const [foods, portions] = await Promise.all([
        foodIds.length
            ? pool.query(`
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
              micronutrients,
              source_metadata,
              verification_status
            from nutrition_foods
            where deleted_at is null
              and status = 'active'
              and id = any($1::uuid[])
          `, [foodIds])
            : Promise.resolve({ rows: [] }),
        foodIds.length ? listFoodPortionMasterRecords(foodIds) : Promise.resolve([]),
    ]);
    const foodsById = new Map(foods.rows.map((row) => [row.id, mapFoodRecord(row)]));
    const portionsByFoodId = new Map();
    portions.forEach((portion) => {
        const next = portionsByFoodId.get(portion.foodId) ?? [];
        next.push(portion);
        portionsByFoodId.set(portion.foodId, next);
    });
    const componentsByVariantId = new Map();
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
    const mappedVariants = candidateRows.map((row) => {
        const components = componentsByVariantId.get(row.id) ?? [];
        const componentAllergens = components.flatMap((component) => component.foodId ? foodsById.get(component.foodId)?.allergenTags ?? [] : []);
        return {
            id: row.id,
            canonicalFamilyId: String(normalizeJsonRecord(row.source_metadata).recipeId ?? row.id),
            mealKey: row.meal_key,
            name: row.variant_name,
            description: row.description,
            cuisineTags: normalizeTagArray(row.cuisine_tags),
            dietaryTags: normalizeTagArray(row.dietary_tags),
            allergenTags: Array.from(new Set([...normalizeTagArray(row.allergen_tags), ...componentAllergens])),
            sourceType: row.source_type,
            nutritionTotals: normalizeNullableNutrients(row.nutrition_totals),
            sourceMetadata: normalizeJsonRecord(row.source_metadata),
            components,
        };
    });
    const eligibleVariants = mappedVariants
        .filter((variant) => {
        const blocked = (input.avoidedFoods ?? []).map(normalizeText).filter(Boolean);
        const blockedAllergens = (input.allergyTags ?? []).map(normalizeText).filter(Boolean);
        const blockedIds = new Set(input.avoidedFoodIds ?? []);
        const searchable = normalizeText([variant.name, ...variant.components.map((component) => component.componentName)].join(' '));
        return blocked.every((food) => !variant.components.some((component) => containsTerm(normalizeText(component.componentName), food))) &&
            blockedAllergens.every((allergen) => !(variant.allergenTags ?? []).map(normalizeText).includes(allergen)) &&
            !variant.components.some((component) => component.foodId != null && blockedIds.has(component.foodId)) &&
            isDietaryPatternCompatible(input.dietPreference, variant.dietaryTags, searchable) &&
            (normalizeText(input.dairyPreference) !== 'avoid' || !containsAny(searchable, dairyTerms));
    })
        .sort((left, right) => {
        const score = (variant) => preferenceScore(variant, input);
        return score(right) - score(left) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
    });
    // The discovery budget is deliberately applied to canonical recipe families,
    // never to portion rows. Keep every useful serving candidate for each chosen
    // family so downstream nutrition optimisation can choose the best serving.
    return selectMealVariantFamilies(eligibleVariants, familyLimit);
};
export const listMealLibrarySlotsForTarget = async (input) => {
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
        };
    })
        .filter((slot) => {
        const hasCanonicalServing = Boolean(slot.portion?.trim()) && slot.portion !== 'Consultant-defined portion';
        const hasRequiredNutrition = [slot.approxKcal, slot.proteinGrams]
            .every((value) => typeof value === 'number' && Number.isFinite(value));
        return hasCanonicalServing && hasRequiredNutrition;
    })
        .filter((slot) => input.includeOutsideTarget || slot.matchClassification !== 'outside_target' || variants.length <= 3);
    return variantSlots;
};
