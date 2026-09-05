import crypto from 'node:crypto';
const CORE_NUTRIENTS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fibre_g'];
const BLOCKED_LICENCES = new Set(['REFERENCE_ONLY', 'SHARE_ALIKE_REVIEW', 'UNKNOWN_BLOCKED']);
export const stableJson = (value) => {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
};
export const sha256 = (value) => crypto.createHash('sha256').update(stableJson(value)).digest('hex');
export const scaleNutrientsForServing = (nutrients, grams) => Object.fromEntries(Object.entries(nutrients).map(([code, amount]) => [code, amount == null ? null : amount * grams / 100]));
export const validateFoodKnowledgeManifest = (manifest) => {
    const issues = [];
    const push = (code, path, message) => issues.push({ code, path, message });
    const sourceById = new Map(manifest.sources.map((source) => [source.id, source]));
    const foodById = new Map(manifest.foods.map((food) => [food.id, food]));
    const nutrientCodes = new Set(manifest.nutrients.map((nutrient) => nutrient.code));
    const familyIds = new Set(manifest.families.map((family) => family.id));
    const cuisineCodes = new Set(manifest.cuisines.map((cuisine) => cuisine.code));
    const allergenCodes = new Set(manifest.allergens.map((allergen) => allergen.code));
    const contextCodes = new Set(manifest.contextTags.map((tag) => tag.code));
    const unique = (values, path, code) => {
        if (new Set(values.map((value) => value.toLowerCase())).size !== values.length)
            push(code, path, 'Duplicate canonical identity.');
    };
    unique(manifest.foods.map((food) => food.id), 'foods', 'DUPLICATE_FOOD_ID');
    unique(manifest.foods.map((food) => food.canonicalCode), 'foods', 'DUPLICATE_CANONICAL_CODE');
    unique(manifest.sources.map((source) => source.code), 'sources', 'DUPLICATE_SOURCE');
    unique(manifest.nutrients.map((nutrient) => nutrient.code), 'nutrients', 'DUPLICATE_NUTRIENT');
    for (const food of manifest.foods) {
        const path = `foods.${food.canonicalCode}`;
        const version = food.version;
        const source = sourceById.get(version.sourceId);
        if (!food.canonicalCode.trim() || !food.canonicalName.trim())
            push('MISSING_IDENTITY', path, 'Canonical identity is required.');
        if (food.familyId && !familyIds.has(food.familyId))
            push('UNKNOWN_FAMILY', path, 'Family does not exist.');
        if (food.foodType === 'INGREDIENT_ONLY' && food.clientConsumable)
            push('INGREDIENT_CLIENT_CONSUMABLE', path, 'Ingredient-only Food cannot be client-consumable.');
        if (food.foodType === 'INGREDIENT_ONLY' && version.productionEligible)
            push('INGREDIENT_DIET_ELIGIBLE', path, 'Ingredient-only Food cannot be Diet eligible.');
        if (!source)
            push('MISSING_SOURCE', path, 'Version source is required.');
        if (source && BLOCKED_LICENCES.has(source.licenceStatus) && version.productionEligible)
            push('BLOCKED_LICENCE', path, 'Blocked licence cannot support production eligibility.');
        const presentNutrients = Object.entries(version.nutrients).filter(([, amount]) => amount != null);
        for (const [code, amount] of presentNutrients) {
            if (!nutrientCodes.has(code))
                push('UNKNOWN_NUTRIENT_CODE', `${path}.nutrients.${code}`, 'Nutrient code is not registered.');
            if (Number(amount) < 0)
                push('INVALID_NUTRIENT', `${path}.nutrients.${code}`, 'Nutrient amount cannot be negative.');
        }
        if (version.productionEligible && CORE_NUTRIENTS.some((code) => version.nutrients[code] == null))
            push('MISSING_CORE_NUTRITION', path, 'Production-eligible Food requires complete core Nutrition.');
        if (version.productionEligible && !version.servings.some((serving) => serving.canonical && serving.clientFriendly))
            push('MISSING_CANONICAL_SERVING', path, 'Production-eligible Food requires a client-friendly canonical serving.');
        if (version.productionEligible && version.mealSuitability.length === 0)
            push('MISSING_MEAL_SUITABILITY', path, 'Production-eligible Food requires meal suitability.');
        if (version.nutritionStatus === 'COMPLETE' && CORE_NUTRIENTS.some((code) => version.nutrients[code] == null))
            push('FALSE_COMPLETE_NUTRITION', path, 'COMPLETE requires every core nutrient.');
        for (const component of version.components) {
            if (!foodById.has(component.foodId))
                push('UNKNOWN_COMPONENT', `${path}.components`, 'Component Food does not exist.');
            if (component.foodId === food.id)
                push('SELF_COMPONENT', `${path}.components`, 'Food cannot contain itself.');
        }
        for (const code of version.cuisines)
            if (!cuisineCodes.has(code))
                push('UNKNOWN_CUISINE', `${path}.cuisines`, code);
        for (const mapping of version.allergens)
            if (!allergenCodes.has(mapping.allergenCode))
                push('UNKNOWN_ALLERGEN', `${path}.allergens`, mapping.allergenCode);
        for (const code of version.contextTags)
            if (!contextCodes.has(code))
                push('UNKNOWN_CONTEXT', `${path}.contextTags`, code);
    }
    const graph = new Map(manifest.foods.map((food) => [food.id, food.version.components.map((component) => component.foodId)]));
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
        if (visiting.has(id)) {
            push('COMPOSITION_CYCLE', `foods.${id}`, 'Composition cycle detected.');
            return;
        }
        if (visited.has(id))
            return;
        visiting.add(id);
        for (const child of graph.get(id) ?? [])
            visit(child);
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of graph.keys())
        visit(id);
    return { valid: issues.length === 0, issues };
};
