import { NUTRITION_MEAL_SEQUENCE } from '../platform/platform.types.js';
export const CALORIE_MACRO_ALLOCATION_METHODOLOGY_VERSION = 'FITEATSY-CALORIE-MACRO-ALLOCATION-CONTRACT-v1';
export const CALORIE_MACRO_ALLOCATION_CONFIG = Object.freeze({
    allocation: Object.freeze({
        earlyMorning: 0.08,
        breakfast: 0.22,
        midMorningSnack: 0.10,
        lunch: 0.26,
        eveningSnack: 0.10,
        dinner: 0.18,
        bedtimeNutrition: 0.06,
    }),
    tolerance: Object.freeze({
        mealCaloriesFraction: 0.10,
        dailyCaloriesFraction: 0.10,
        proteinFraction: 0.20,
        carbohydratesFraction: 0.20,
        fatFraction: 0.20,
        fibreFraction: 0.25,
    }),
    practicalServingMultipliers: Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]),
});
const round = (value, digits) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};
const band = (value, tolerance, digits) => value == null
    ? { min: null, max: null }
    : { min: round(value * (1 - tolerance), digits), max: round(value * (1 + tolerance), digits) };
const allocateReconciled = (daily, digits) => {
    if (daily == null || !Number.isFinite(daily))
        return Object.fromEntries(NUTRITION_MEAL_SEQUENCE.map((key) => [key, null]));
    const factor = 10 ** digits;
    const totalUnits = Math.round(daily * factor);
    const raw = NUTRITION_MEAL_SEQUENCE.map((key) => ({ key, units: totalUnits * CALORIE_MACRO_ALLOCATION_CONFIG.allocation[key] }));
    const base = raw.map((item) => ({ ...item, allocated: Math.floor(item.units) }));
    let remaining = totalUnits - base.reduce((sum, item) => sum + item.allocated, 0);
    [...base]
        .sort((a, b) => (b.units - Math.floor(b.units)) - (a.units - Math.floor(a.units)) || NUTRITION_MEAL_SEQUENCE.indexOf(a.key) - NUTRITION_MEAL_SEQUENCE.indexOf(b.key))
        .forEach((item) => { if (remaining > 0) {
        base.find((entry) => entry.key === item.key).allocated += 1;
        remaining -= 1;
    } });
    return Object.fromEntries(base.map((item) => [item.key, item.allocated / factor]));
};
export const deriveVersionedMealTargets = (daily) => {
    const calories = allocateReconciled(daily.calories, 0);
    const protein = allocateReconciled(daily.proteinGrams, 1);
    const carbs = allocateReconciled(daily.carbsGrams, 1);
    const fat = allocateReconciled(daily.fatGrams, 1);
    const fibre = allocateReconciled(daily.fibreGrams, 1);
    return Object.fromEntries(NUTRITION_MEAL_SEQUENCE.map((key) => {
        const target = {
            calories: calories[key], proteinGrams: protein[key], carbsGrams: carbs[key], fatGrams: fat[key], fibreGrams: fibre[key],
            caloriesBand: band(calories[key], CALORIE_MACRO_ALLOCATION_CONFIG.tolerance.mealCaloriesFraction, 0),
            proteinBand: band(protein[key], CALORIE_MACRO_ALLOCATION_CONFIG.tolerance.proteinFraction, 1),
            carbsBand: band(carbs[key], CALORIE_MACRO_ALLOCATION_CONFIG.tolerance.carbohydratesFraction, 1),
            fatBand: band(fat[key], CALORIE_MACRO_ALLOCATION_CONFIG.tolerance.fatFraction, 1),
            fibreBand: band(fibre[key], CALORIE_MACRO_ALLOCATION_CONFIG.tolerance.fibreFraction, 1),
            methodologyVersion: CALORIE_MACRO_ALLOCATION_METHODOLOGY_VERSION,
            allocationBasis: `Approved Fiteatsy seven-meal allocation (${CALORIE_MACRO_ALLOCATION_CONFIG.allocation[key] * 100}%) with deterministic largest-remainder reconciliation.`,
        };
        return [key, target];
    }));
};
const inside = (value, range) => range?.min == null || range.max == null
    ? true
    : value != null && Number.isFinite(value) && value >= range.min && value <= range.max;
export const optionFitsMealTarget = (option, target) => inside(option.approxKcal, target.caloriesBand) && inside(option.proteinGrams, target.proteinBand) &&
    inside(option.carbsGrams, target.carbsBand) && inside(option.fatGrams, target.fatBand) && inside(option.fibreGrams, target.fibreBand);
const scaleNullable = (value, multiplier) => value == null ? null : round(value * multiplier, 1);
/** Selects only practical half/quarter serving increments; it never creates a new recipe identity. */
export const optimiseMealOptionPortion = (option, target) => {
    const candidates = CALORIE_MACRO_ALLOCATION_CONFIG.practicalServingMultipliers.map((multiplier) => {
        const scaled = {
            ...option,
            portion: multiplier === 1 ? option.portion : `${multiplier} × (${option.portion})`,
            approxKcal: scaleNullable(option.approxKcal, multiplier),
            proteinGrams: scaleNullable(option.proteinGrams, multiplier),
            carbsGrams: scaleNullable(option.carbsGrams, multiplier),
            fatGrams: scaleNullable(option.fatGrams, multiplier),
            fibreGrams: scaleNullable(option.fibreGrams, multiplier),
            recommendationReason: `${option.recommendationReason ?? 'Verified meal-library candidate'} Portion optimised with ${CALORIE_MACRO_ALLOCATION_METHODOLOGY_VERSION}.`,
            components: option.components?.map((component) => ({
                ...component,
                quantity: scaleNullable(component.quantity, multiplier),
                canonicalGrams: scaleNullable(component.canonicalGrams, multiplier),
                calories: scaleNullable(component.calories, multiplier),
                proteinGrams: scaleNullable(component.proteinGrams, multiplier),
                carbsGrams: scaleNullable(component.carbsGrams, multiplier),
                fatGrams: scaleNullable(component.fatGrams, multiplier),
                fibreGrams: scaleNullable(component.fibreGrams, multiplier),
            })),
        };
        const calorieDistance = target.calories && scaled.approxKcal ? Math.abs(scaled.approxKcal - target.calories) / target.calories : 0;
        return { scaled, multiplier, score: calorieDistance + Math.abs(1 - multiplier) * 0.001 };
    });
    return candidates.filter(({ scaled }) => optionFitsMealTarget(scaled, target)).sort((a, b) => a.score - b.score || a.multiplier - b.multiplier)[0]?.scaled ?? null;
};
const optionFamilyIdentity = (option) => {
    if (option.canonicalFamilyId?.trim())
        return `recipe:${option.canonicalFamilyId.trim().toLowerCase()}`;
    const foodIdentity = (option.components ?? []).map((item) => item.foodId).filter(Boolean).sort().join('+');
    return foodIdentity || option.id?.trim().toLowerCase() || option.meal.trim().toLowerCase();
};
export const validateAllocatedDiet = (content) => {
    // Legacy versions remain readable; the new contract is enforced only on versions carrying its snapshot.
    if (content.allocationSnapshot?.methodologyVersion !== CALORIE_MACRO_ALLOCATION_METHODOLOGY_VERSION)
        return { valid: true, code: null, failures: [] };
    const failures = [];
    for (const key of NUTRITION_MEAL_SEQUENCE) {
        const section = content.mealPlan[key];
        if (!section.target) {
            failures.push(`${key}: missing meal target snapshot`);
            continue;
        }
        const families = new Set();
        for (const option of section.options) {
            const family = optionFamilyIdentity(option);
            if (families.has(family))
                failures.push(`${key}: duplicate canonical recipe ${family}`);
            families.add(family);
            if (!optionFitsMealTarget(option, section.target))
                failures.push(`${key}: ${option.id ?? option.meal} is outside its nutrition envelope`);
        }
    }
    const calorieTarget = content.dailyTargets.calories;
    if (calorieTarget != null) {
        const lows = NUTRITION_MEAL_SEQUENCE.map((key) => Math.min(...content.mealPlan[key].options.map((item) => item.approxKcal ?? Number.POSITIVE_INFINITY)));
        const highs = NUTRITION_MEAL_SEQUENCE.map((key) => Math.max(...content.mealPlan[key].options.map((item) => item.approxKcal ?? Number.NEGATIVE_INFINITY)));
        const range = band(calorieTarget, CALORIE_MACRO_ALLOCATION_CONFIG.tolerance.dailyCaloriesFraction, 0);
        const minimum = lows.reduce((sum, value) => sum + value, 0);
        const maximum = highs.reduce((sum, value) => sum + value, 0);
        if (!inside(minimum, range) || !inside(maximum, range))
            failures.push(`daily calorie choice envelope ${minimum}-${maximum} is outside ${range.min}-${range.max}`);
    }
    return { valid: failures.length === 0, code: failures.length ? 'DIET_NUTRITION_ENVELOPE_INVALID' : null, failures };
};
export const analyseAllCalorieCombinations = (content) => {
    let count = 0;
    let sum = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let outside = 0;
    const values = NUTRITION_MEAL_SEQUENCE.map((key) => content.mealPlan[key].options.map((item) => item.approxKcal));
    const target = content.dailyTargets.calories;
    const allowed = band(target, CALORIE_MACRO_ALLOCATION_CONFIG.tolerance.dailyCaloriesFraction, 0);
    const visit = (depth, total) => {
        if (depth === values.length) {
            count += 1;
            sum += total;
            minimum = Math.min(minimum, total);
            maximum = Math.max(maximum, total);
            if (!inside(total, allowed))
                outside += 1;
            return;
        }
        values[depth].forEach((value) => visit(depth + 1, total + value));
    };
    visit(0, 0);
    return { count, minimum, maximum, mean: count ? round(sum / count, 2) : null, outside, allowed };
};
