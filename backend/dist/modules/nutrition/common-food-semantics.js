import { classifyFoodQuality } from './common-food-ranking.js';
export const COMMON_FOOD_SEMANTICS_VERSION = 'COMMON_FOOD_SEMANTICS_V1';
const n = (f) => `${f.canonicalName} ${f.displayName}`.toLowerCase();
const any = (v, x) => x.some(t => v.includes(t));
const role = (f) => f.roles.includes('PULSE') ? 'PULSE' : f.roles.includes('PROTEIN') ? 'PROTEIN' : f.roles.includes('VEGETABLE') ? 'VEGETABLE' : f.roles.includes('FRUIT') ? 'FRUIT' : f.roles.includes('DAIRY') ? 'DAIRY' : f.roles.includes('NUT_SEED') ? 'NUT_SEED' : f.roles.includes('BEVERAGE') ? 'BEVERAGE' : f.roles.some(r => ['STARCH', 'GRAIN', 'BREAD'].includes(r)) ? 'STAPLE' : f.roles.includes('FAT') ? 'FAT' : 'ACCOMPANIMENT';
export const ontologyFor = (f) => { const name = n(f), quality = classifyFoodQuality(f); const flour = any(name, ['flour', 'atta']), raw = flour || any(name, [', raw', 'raw ']) || any(name, ['rice, raw', 'dry lentil', 'chickpeas, dry']), oil = f.category === 'oil' || any(name, [' oil', 'ghee']), condiment = any(name, ['lemon', 'garlic', 'ginger', 'turmeric', 'cumin', 'coriander seed', 'onion']), seed = f.category === 'seeds' || any(name, ['flaxseed', 'sesame seed']), beverage = f.roles.includes('BEVERAGE') && !f.roles.some(r => ['GRAIN', 'VEGETABLE', 'FRUIT'].includes(r)); const entityType = oil || condiment ? 'CONDIMENT' : seed ? 'TOPPING' : raw ? 'RAW_INGREDIENT' : beverage ? 'BEVERAGE' : f.foodType === 'VALIDATED_RECIPE' ? 'DISH' : f.category === 'fruit' || f.category === 'nuts' ? 'SUPPLEMENTAL_COMPONENT' : 'PREPARED_FOOD'; const ingredientOnly = raw || oil || any(name, ['garlic', 'ginger', 'turmeric', 'cumin seed', 'coriander seed']); const primaryRole = oil || condiment ? 'CONDIMENT' : role(f); let min = 20, max = 350, unit = 'bowl', label = `1 bowl ${f.displayName}`; if (f.category === 'fruit') {
    min = 50;
    max = 250;
    unit = 'piece';
    label = `1 medium ${f.displayName}`;
} if (f.category === 'dairy') {
    min = 75;
    max = 300;
    unit = any(name, ['milk', 'buttermilk']) ? 'glass' : 'cup';
    label = unit === 'glass' ? `1 glass ${f.displayName}` : `½ cup ${f.displayName}`;
} if (seed) {
    min = 5;
    max = 20;
    unit = 'tbsp';
    label = `1 tbsp ${f.displayName}`;
} if (f.category === 'nuts') {
    min = 5;
    max = 40;
    unit = 'g';
    label = any(name, ['almond']) ? `10 ${f.displayName}` : `${Math.min(30, f.servings[0]?.grams ?? 30)} g ${f.displayName}`;
} if (oil) {
    min = 2;
    max = 10;
    unit = 'tsp';
    label = `1 tsp ${f.displayName}`;
} if (condiment && !oil) {
    min = 2;
    max = 20;
    unit = 'tbsp';
    label = any(name, ['lemon']) ? '1 lemon wedge' : `1 tbsp ${f.displayName}`;
} if (f.roles.includes('PULSE')) {
    min = 75;
    max = 250;
    unit = 'katori';
    label = `1 katori ${f.displayName}`;
} if (f.roles.some(r => ['GRAIN', 'STARCH', 'BREAD'].includes(r)) && !raw) {
    min = 50;
    max = 250;
    unit = 'katori';
    label = `1 katori ${f.displayName}`;
} return { canonicalFoodId: f.id, entityType, primaryRole, clientFacing: f.clientConsumable && !ingredientOnly, ingredientOnly, canBePrimaryMealComponent: !ingredientOnly && !['CONDIMENT', 'TOPPING'].includes(entityType), canCarryMealCalories: !ingredientOnly && !['CONDIMENT', 'TOPPING'].includes(entityType), serving: { defaultGrams: f.servings.find(s => s.isDefault)?.grams ?? f.servings[0]?.grams ?? 100, minGrams: min, maxGrams: max, displayUnit: unit, clientDisplayLabel: label, scalable: !ingredientOnly }, preferredMealHeads: quality.preferredMealHeads, allowedMealHeads: quality.allowedMealHeads, discouragedMealHeads: quality.discouragedMealHeads }; };
export const withSemanticServingProfile = (food) => { const ontology = ontologyFor(food), source = food.servings.find(x => x.isDefault) ?? food.servings[0]; if (!source || !ontology.clientFacing)
    return food; const grams = ontology.entityType === 'TOPPING' ? 10 : food.category === 'nuts' ? 20 : source.grams; const label = food.category === 'nuts' ? `${grams} g` : ontology.serving.clientDisplayLabel; return { ...food, servings: [{ ...source, id: grams === source.grams ? source.id : `${source.id}:SEMANTIC`, label, unit: ontology.serving.displayUnit, grams, minMultiplier: .5, maxMultiplier: 2, allowedMultipliers: [.5, 1, 1.5, 2], isDefault: true }] }; };
export const humanServing = (component, food) => { if (food.foodType === 'VALIDATED_RECIPE') {
    const amount = component.multiplier;
    if (food.canonicalCode === 'CP_CHAPATI')
        return `${amount} ${amount === 1 ? 'Chapati' : 'Chapatis'}`;
    return `${amount === .5 ? '½' : amount} katori ${food.displayName}`;
} return `${component.grams} g ${food.displayName}`; };
const mealRoles = (components, foods) => new Set(components.flatMap(c => foods.get(c.foodId)?.roles ?? []));
export const validateMealQuality = (input) => { const reasons = []; let servingSanity = true, clientFacing = true; for (const c of input.components) {
    const f = input.foods.get(c.foodId);
    if (!f) {
        clientFacing = false;
        reasons.push('FOOD_NOT_FOUND');
        continue;
    }
    const o = ontologyFor(f);
    if (o.ingredientOnly || !o.clientFacing) {
        clientFacing = false;
        reasons.push(`INGREDIENT_ONLY:${f.id}`);
    }
    if (c.grams < o.serving.minGrams || c.grams > o.serving.maxGrams) {
        servingSanity = false;
        reasons.push(`SERVING_OUT_OF_RANGE:${f.id}`);
    }
    if (!o.canBePrimaryMealComponent && input.components.length === 1) {
        clientFacing = false;
        reasons.push(`NON_PRIMARY_COMPONENT:${f.id}`);
    }
} const roles = mealRoles(input.components, input.foods); const main = ['LUNCH', 'DINNER'].includes(input.mealHead); const structure = main ? roles.has('VEGETABLE') && [...roles].some(r => ['PULSE', 'PROTEIN'].includes(r)) && [...roles].some(r => ['STARCH', 'GRAIN', 'BREAD'].includes(r)) : input.components.length > 0; const kcal = input.nutrition.kcal, protein = input.nutrition.protein; const deviation = kcal === null ? Infinity : Math.abs(kcal - input.target.kcal); const calories = kcal === null || deviation > Math.max(input.target.kcalTolerance * 2, input.target.kcal * .6) ? 'HARD_REJECT' : deviation <= input.target.kcalTolerance ? 'GOOD_FIT' : 'FALLBACK'; const proteinState = protein === null ? 'SHORTAGE' : Math.abs(protein - input.target.protein) <= input.target.proteinTolerance ? 'GOOD_FIT' : (protein < input.target.protein - input.target.proteinTolerance) ? 'SHORTAGE' : 'ACCEPTABLE'; if (!structure)
    reasons.push('MEAL_STRUCTURE_INCOMPLETE'); if (calories === 'HARD_REJECT')
    reasons.push('HARD_CALORIE_MISMATCH'); return { structure: structure ? 'COMPLETE' : 'INCOMPLETE', servingSanity: servingSanity ? 'PASS' : 'FAIL', calories, protein: proteinState, safety: 'PASS', clientFacingSemantics: clientFacing ? 'PASS' : 'FAIL', eligible: structure && servingSanity && clientFacing && calories !== 'HARD_REJECT', reasons }; };
export const mealTitle = (components, foods) => components.flatMap(c => { const f = foods.get(c.foodId); return f && ontologyFor(f).clientFacing ? [f.displayName] : []; }).join(' + ');
export const decorateSemanticOption = (option, foods, target) => { const quality = validateMealQuality({ components: option.components, foods, mealHead: option.mealHead, nutrition: option.nutrition, target }); return { ...option, semanticVersion: COMMON_FOOD_SEMANTICS_VERSION, clientTitle: mealTitle(option.components, foods), humanServingSummary: option.components.flatMap(c => { const f = foods.get(c.foodId); return f ? [humanServing(c, f)] : []; }).join(' · '), mealQuality: quality }; };
