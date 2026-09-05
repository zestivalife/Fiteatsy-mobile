import { deriveVersionedMealTargets } from './calorie-macro-allocation.js';
const round = (value, digits = 1) => {
    if (value == null || !Number.isFinite(value))
        return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};
const sumNullable = (values) => {
    const present = values.filter((value) => value != null && Number.isFinite(value));
    if (!present.length)
        return null;
    return present.reduce((total, value) => total + value, 0);
};
export const resolvePortionMasterQuantity = (portion, multiplier = 1) => {
    if (!portion || !Number.isFinite(multiplier) || multiplier <= 0)
        return null;
    if (portion.canonicalGrams == null || !Number.isFinite(portion.canonicalGrams))
        return null;
    return round(portion.canonicalGrams * multiplier, 1);
};
export const scaleNutritionVector = (reference, actualQuantity, referenceQuantity) => {
    if (actualQuantity == null ||
        referenceQuantity == null ||
        !Number.isFinite(actualQuantity) ||
        !Number.isFinite(referenceQuantity) ||
        referenceQuantity <= 0) {
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
export const calculateMealComponentNutrition = (food, quantity, canonicalQuantityOverride) => {
    const canonicalQuantity = canonicalQuantityOverride ?? quantity;
    const scaled = scaleNutritionVector({
        calories: food.calories,
        proteinGrams: food.proteinGrams,
        carbsGrams: food.carbsGrams,
        fatGrams: food.fatGrams,
        fibreGrams: food.fibreGrams,
    }, canonicalQuantity, food.referenceQuantity);
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
export const calculateMealNutritionTotals = (components) => ({
    calories: round(sumNullable(components.map((component) => component.calories)), 1),
    proteinGrams: round(sumNullable(components.map((component) => component.proteinGrams)), 1),
    carbsGrams: round(sumNullable(components.map((component) => component.carbsGrams)), 1),
    fatGrams: round(sumNullable(components.map((component) => component.fatGrams)), 1),
    fibreGrams: round(sumNullable(components.map((component) => component.fibreGrams)), 1),
});
export const deriveMealTargets = (input) => deriveVersionedMealTargets({
    calories: input.caloriesTarget,
    proteinGrams: input.proteinTargetGrams,
    carbsGrams: input.carbohydrateTargetGrams,
    fatGrams: input.fatTargetGrams,
    fibreGrams: input.fibreTargetGrams,
});
const scoreVariance = (target, actual) => {
    if (target == null || actual == null || target <= 0)
        return Number.POSITIVE_INFINITY;
    return Math.abs(actual - target) / target;
};
export const classifyMealMatch = (target, totals) => {
    if (!target || target.calories == null || totals.calories == null)
        return 'outside_target';
    const calorieVariance = scoreVariance(target.calories, totals.calories);
    const configuredVariances = [
        calorieVariance,
        target.proteinGrams == null ? null : scoreVariance(target.proteinGrams, totals.proteinGrams),
        target.carbsGrams == null ? null : scoreVariance(target.carbsGrams, totals.carbsGrams ?? null),
        target.fatGrams == null ? null : scoreVariance(target.fatGrams, totals.fatGrams ?? null),
    ].filter((value) => value != null);
    const composite = configuredVariances.reduce((sum, value) => sum + value, 0) / configuredVariances.length;
    if (composite <= 0.05)
        return 'best_match';
    if (composite <= 0.12)
        return 'good_match';
    if (composite <= 0.2)
        return 'acceptable';
    return 'outside_target';
};
export const mealVariantToSlot = (variant, target, slot) => {
    const totals = calculateMealNutritionTotals(variant.components);
    return {
        id: variant.id,
        canonicalFamilyId: variant.canonicalFamilyId,
        slot,
        meal: variant.name,
        portion: variant.components
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
export const buildRecommendationSets = (options) => {
    const groups = [];
    const bestMatch = options.filter((option) => option.matchClassification === 'best_match').map((option) => option.id).filter(Boolean);
    const goodMatch = options.filter((option) => option.matchClassification === 'good_match').map((option) => option.id).filter(Boolean);
    const highProtein = options
        .filter((option) => (option.proteinGrams ?? 0) >= 20)
        .map((option) => option.id)
        .filter(Boolean);
    const consultantMeals = options
        .filter((option) => option.sourceType === 'consultant_custom')
        .map((option) => option.id)
        .filter(Boolean);
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
export const findSimilarMealSlots = (source, options, limit = 6) => options
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
