import { canonicalHash } from './food-curation/canonical-food-foundation.js';
import { COMMON_FOOD_RANKING_VERSION_V2, COMMON_FOOD_RANKING_VERSION_V3, optionSimilarity, rankingV3Weights, scoreDayAwareQuality, scoreHealthAndDiversity } from './common-food-ranking.js';
import { decorateSemanticOption, ontologyFor } from './common-food-semantics.js';
export const COMMON_FOOD_GENERATOR_VERSION = 'COMMON_FOOD_COMBINATION_ENGINE_V1';
export const COMMON_FOOD_RANKING_VERSION = 'COMMON_FOOD_RANKING_V1';
export const MEAL_TEMPLATE_VERSION = 'INDIA_COMMON_MEAL_TEMPLATES_V2';
export const MEAL_HEADS = ['EARLY_MORNING', 'BREAKFAST', 'MID_MORNING', 'LUNCH', 'EVENING_SNACK', 'DINNER', 'BEDTIME'];
export const COMPONENT_ROLES = ['STARCH', 'GRAIN', 'BREAD', 'PULSE', 'PROTEIN', 'VEGETABLE', 'FRUIT', 'DAIRY', 'FAT', 'NUT_SEED', 'BEVERAGE', 'ACCOMPANIMENT'];
export const DEFAULT_MEAL_TEMPLATES = MEAL_HEADS.map(mealHead => ({ id: `TPL_${mealHead}`, version: MEAL_TEMPLATE_VERSION, mealHead, alternatives: { EARLY_MORNING: [{ roles: [['FRUIT']] }, { roles: [['BEVERAGE']] }, { roles: [['NUT_SEED'], ['BEVERAGE']] }], BREAKFAST: [{ roles: [['STARCH', 'BREAD'], ['PROTEIN'], ['FRUIT', 'DAIRY']] }, { roles: [['PROTEIN'], ['DAIRY']] }], MID_MORNING: [{ roles: [['FRUIT']] }, { roles: [['DAIRY']] }, { roles: [['FRUIT'], ['NUT_SEED']] }], LUNCH: [{ roles: [['BREAD', 'STARCH', 'GRAIN'], ['PULSE', 'PROTEIN'], ['VEGETABLE'], ['ACCOMPANIMENT']] }, { roles: [['GRAIN'], ['PULSE', 'PROTEIN'], ['VEGETABLE']] }], EVENING_SNACK: [{ roles: [['FRUIT']] }, { roles: [['DAIRY']] }, { roles: [['NUT_SEED']] }, { roles: [['STARCH'], ['PROTEIN']] }], DINNER: [{ roles: [['BREAD', 'STARCH', 'GRAIN'], ['PULSE', 'PROTEIN'], ['VEGETABLE']] }, { roles: [['PROTEIN'], ['VEGETABLE'], ['ACCOMPANIMENT']] }], BEDTIME: [{ roles: [['DAIRY']] }, { roles: [['BEVERAGE']] }, { roles: [['DAIRY'], ['NUT_SEED']] }] }[mealHead] }));
const known = (values) => values.some(v => v === null) ? null : values.reduce((sum, v) => sum + v, 0);
export const scaleNutrition = (n, grams) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v === null ? null : v * grams / 100]));
export const sumNutrition = (values) => ({ kcal: known(values.map(v => v.kcal)), protein: known(values.map(v => v.protein)), carbohydrate: known(values.map(v => v.carbohydrate)), fat: known(values.map(v => v.fat)), fibre: known(values.map(v => v.fibre)) });
export function eligibleCommonFoods(foods, context, mealHead, role) {
    return foods.filter(f => f.active && f.clientConsumable && f.generatorEligible && f.mealHeads.includes(mealHead) && (!role || f.roles.includes(role)) && !f.allergens.some(x => context.allergies.includes(x)) && !f.intolerances.some(x => context.intolerances.includes(x)) && !f.avoidTags.some(x => context.avoids.includes(x)) && !f.clinicalTags.some(x => context.clinicalExclusions.includes(x)) && dietAllowed(f.vegetarianClass, context.diet) && f.servings.some(s => s.active && s.grams > 0));
}
const dietAllowed = (food, diet) => diet === 'NON_VEGETARIAN' || diet === 'EGG' && food !== 'NON_VEGETARIAN' || diet === 'VEGETARIAN' && ['VEGAN', 'VEGETARIAN'].includes(food) || diet === 'VEGAN' && food === 'VEGAN';
const component = (food, serving, multiplier) => { if (!serving.active || !serving.allowedMultipliers.includes(multiplier) || multiplier < serving.minMultiplier || multiplier > serving.maxMultiplier)
    throw new Error('INVALID_SERVING_MULTIPLIER'); const grams = serving.grams * multiplier; return { componentId: canonicalHash({ food: food.id, serving: serving.id, multiplier }).slice(0, 24), foodId: food.id, foodVersion: food.version, foodDisplayNameSnapshot: food.displayName, servingId: serving.id, servingVersion: serving.version, servingDisplayNameSnapshot: serving.label, multiplier, grams, millilitres: serving.millilitres === null ? null : serving.millilitres * multiplier, label: `${multiplier} × ${serving.label}`, sourceType: food.foodType === 'VALIDATED_RECIPE' ? 'VALIDATED_RECIPE' : 'COMMON_FOOD', sourceMappingId: food.sourceMappingId, nutrition: scaleNutrition(food.nutrientsPer100g, grams) }; };
const chooseServing = (food) => food.servings.find(s => s.active && s.isDefault) ?? food.servings.find(s => s.active);
const preference = (components, foods, c) => components.reduce((n, x) => n + (c.preferences.some(p => foods.get(x.foodId)?.aliases.concat(foods.get(x.foodId).family).includes(p)) ? 2 : 0) - (c.dislikes.some(p => foods.get(x.foodId)?.aliases.concat(foods.get(x.foodId).family).includes(p)) ? 2 : 0), 0);
const nutritionScore = (n, t) => n.kcal === null || n.protein === null ? -100 : 100 - Math.abs(n.kcal - t.kcal) / Math.max(1, t.kcalTolerance) - Math.abs(n.protein - t.protein) / Math.max(1, t.proteinTolerance);
export function generateMealCombinations(input) {
    const template = input.template ?? DEFAULT_MEAL_TEMPLATES.find(x => x.mealHead === input.mealHead);
    const limit = input.limit ?? 5;
    const foodsById = new Map(input.foods.map(f => [f.id, f]));
    const candidates = [];
    const eligible = eligibleCommonFoods(input.foods, input.context, input.mealHead).filter(f => !input.semanticV1 || ontologyFor(f).clientFacing);
    for (const alternative of template.alternatives) {
        const pools = alternative.roles.map(roleSet => eligible.filter(f => roleSet.some(r => f.roles.includes(r))).slice(0, 12));
        if (pools.some(p => p.length === 0))
            continue;
        const walk = (at, chosen) => { if (candidates.length >= 500)
            return; if (at === pools.length) {
            if (new Set(chosen.map(x => x.id)).size !== chosen.length)
                return;
            const components = chosen.map(f => component(f, chooseServing(f), 1));
            const nutrition = sumNutrition(components.map(x => x.nutrition));
            const families = chosen.map(x => x.family);
            const diversitySignature = canonicalHash({ families: [...families].sort() }).slice(0, 24);
            const preferenceScore = preference(components, foodsById, input.context);
            const nScore = nutritionScore(nutrition, input.target);
            const useV3 = input.rankingV3 !== false && input.rankingV2 !== false;
            const v2 = input.rankingV2 === false ? { vegetableHealthScore: 0, starchStackingPenalty: 0, ingredientRepetitionPenalty: 0, familyDiversityPenalty: 0, healthDiversityScore: 0 } : scoreHealthAndDiversity({ components, nutrition, foods: foodsById, dailyUsage: input.dailyUsage });
            const v3 = useV3 ? scoreDayAwareQuality({ components, nutrition, foods: foodsById, dailyUsage: input.dailyUsage, mealHead: input.mealHead, targetKcal: input.target.kcal, targetProtein: input.target.protein }) : null;
            const ranking = v3 ?? v2;
            const payload = { mealHead: input.mealHead, components, nutrition, templateId: template.id, templateVersion: template.version, generatorVersion: COMMON_FOOD_GENERATOR_VERSION, rankingVersion: input.rankingV2 === false ? COMMON_FOOD_RANKING_VERSION : useV3 ? COMMON_FOOD_RANKING_VERSION_V3 : COMMON_FOOD_RANKING_VERSION_V2, diversitySignature, preferenceScore, nutritionScore: nScore, vegetableHealthScore: ranking.vegetableHealthScore, starchStackingPenalty: ranking.starchStackingPenalty, ingredientRepetitionPenalty: ranking.ingredientRepetitionPenalty, familyDiversityPenalty: ranking.familyDiversityPenalty, rankingFactors: v3 ? { calorieFit: v3.calorieFit, proteinFit: v3.proteinFit, starchPenalty: v3.starchStackingPenalty, exactFoodRepetitionPenalty: v3.exactFoodRepetitionPenalty, vegetableFamilyPenalty: v3.familyDiversityPenalty, grainFamilyPenalty: v3.grainFamilyPenalty, pulseProteinFamilyPenalty: v3.pulseFamilyPenalty + v3.proteinFamilyPenalty, adjacentMealPenalty: v3.adjacentMealPenalty, mealAppropriateness: v3.mealAppropriateness, pairingCompatibility: v3.pairingCompatibility } : undefined, overallScore: nScore + preferenceScore + (v3 ? v3.finalAdjustment : v2.healthDiversityScore), warnings: nutrition.fibre === null ? ['FIBRE_NOT_REPORTED_NO_FIBRE_CLAIM'] : [], shortages: [] };
            candidates.push({ ...payload, combinationId: canonicalHash(payload).slice(0, 32) });
            return;
        } for (const food of pools[at])
            walk(at + 1, [...chosen, food]); };
        walk(0, []);
    }
    candidates.sort((a, b) => b.overallScore - a.overallScore || a.combinationId.localeCompare(b.combinationId));
    const semanticallyEligible = input.semanticV1 ? candidates.map(x => decorateSemanticOption(x, foodsById, input.target)).filter(x => x.mealQuality.eligible) : candidates;
    const selected = [];
    for (const x of semanticallyEligible) {
        if (selected.some(y => y.diversitySignature === x.diversitySignature))
            continue;
        const similarity = selected.reduce((m, y) => Math.max(m, optionSimilarity(x.components, y.components)), 0);
        if (input.rankingV3 !== false && similarity >= .75 && semanticallyEligible.some(z => !selected.includes(z) && selected.every(y => optionSimilarity(z.components, y.components) < .75)))
            continue;
        if (similarity > 0)
            x.rankingFactors = { ...(x.rankingFactors ?? {}), intraMealSimilarityPenalty: similarity * rankingV3Weights.intraMealSimilarityPenalty };
        selected.push(x);
        if (selected.length === limit)
            break;
    }
    return { options: selected, shortage: selected.length < limit ? { state: 'SHORTAGE', available: selected.length, required: limit, missing: limit - selected.length } : null, candidateCount: candidates.length, eligibleFoodCount: eligible.length, rejectedBySemanticGate: candidates.length - semanticallyEligible.length, inputHash: canonicalHash({ context: input.context, mealHead: input.mealHead, target: input.target, template: template.version, semanticV1: Boolean(input.semanticV1), rankingVersion: input.rankingV2 === false ? COMMON_FOOD_RANKING_VERSION : input.rankingV3 === false ? COMMON_FOOD_RANKING_VERSION_V2 : COMMON_FOOD_RANKING_VERSION_V3, foods: eligible.map(f => [f.id, f.version]) }) };
}
export function validateManualCombination(input) { const eligible = new Map(eligibleCommonFoods(input.foods, input.context, input.mealHead).map(f => [f.id, f])); const built = input.components.map(x => { const food = eligible.get(x.foodId); if (!food)
    throw new Error('UNSAFE_OR_INELIGIBLE_FOOD'); const serving = food.servings.find(s => s.id === x.servingId); if (!serving)
    throw new Error('SERVING_NOT_FOUND'); return component(food, serving, x.multiplier); }); const nutrition = sumNutrition(built.map(x => x.nutrition)); return { components: built, nutrition, withinTarget: nutrition.kcal !== null && nutrition.protein !== null && Math.abs(nutrition.kcal - input.target.kcal) <= input.target.kcalTolerance && Math.abs(nutrition.protein - input.target.protein) <= input.target.proteinTolerance, snapshotHash: canonicalHash({ components: built, nutrition }) }; }
