import { P0_APPROVED_GENERIC_MAPPINGS } from './food-curation/p0-approved-generic-mappings.js';
const mealHeadsByCategory = {
    fruit: ['EARLY_MORNING', 'BREAKFAST', 'MID_MORNING', 'EVENING_SNACK'],
    protein: ['BREAKFAST', 'LUNCH', 'EVENING_SNACK', 'DINNER'],
    vegetable: ['BREAKFAST', 'LUNCH', 'EVENING_SNACK', 'DINNER'],
};
export function createP0ApprovedGenericFoods(catalogueFoods, decisions) {
    const foodsByFdcId = new Map(catalogueFoods.map((food) => [food.fdcId, food]));
    const mappedDecisions = new Map(decisions.map((decision) => [decision.sourceRecordId, decision]));
    return P0_APPROVED_GENERIC_MAPPINGS.flatMap((mapping) => {
        const decision = mappedDecisions.get(mapping.sourceRecordId);
        const food = foodsByFdcId.get(mapping.fdcId);
        if (!decision || !food || !decision.sourceMapping || (!decision.generatorEligible && !decision.componentEligible))
            return [];
        const n = food.nutrients;
        if (!['calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams'].every((key) => Number.isFinite(n[key])))
            return [];
        const roles = decision.category.toLowerCase().includes('fruit') ? ['FRUIT'] : food.foodCategory === 'protein' ? ['PROTEIN'] : ['VEGETABLE'];
        return [{
                id: decision.referenceItemId, version: 1, canonicalCode: `P0_USDA_${mapping.fdcId}`, canonicalName: decision.canonicalName.toLowerCase(),
                displayName: decision.canonicalName, foodType: 'COMMON_FOOD', family: decision.canonicalName.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
                category: food.foodCategory ?? 'uncategorised', countryContext: 'GLOBAL_GENERIC', isIndianSpecificFood: false,
                sourcePolicyClass: 'GLOBAL_GENERIC_APPROVED', sourceMappingId: `USDA_FDC:${mapping.fdcId}`, sourceVersion: food.publicationDate,
                vegetarianClass: food.dietaryTags.includes('non-vegetarian') ? 'NON_VEGETARIAN' : food.dietaryTags.includes('vegetarian') ? 'VEGETARIAN' : 'VEGAN',
                dietTags: food.dietaryTags, allergens: food.allergenTags, intolerances: [], clinicalTags: [], avoidTags: [],
                mealHeads: mealHeadsByCategory[food.foodCategory ?? ''] ?? ['BREAKFAST', 'LUNCH', 'DINNER'], roles: [...roles],
                nutrientsPer100g: { kcal: n.calories, protein: n.proteinGrams, carbohydrate: n.carbohydrateGrams, fat: n.fatGrams, fibre: n.fibreGrams },
                servings: [{ id: `SV_P0_${decision.sourceRecordId}_100G`, version: 1, label: '100 g', grams: 100, millilitres: null, unit: 'gram', isDefault: true, minMultiplier: .5, maxMultiplier: 2, allowedMultipliers: [.5, 1, 1.5, 2], active: true }],
                active: true, clientConsumable: true, generatorEligible: decision.generatorEligible,
                aliases: [decision.canonicalName.toLowerCase(), ...decision.aliases.map((alias) => alias.toLowerCase()), food.displayName.toLowerCase(), food.canonicalName],
            }];
    });
}
