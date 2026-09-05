import type { CatalogueFood } from './catalogue/catalogue.types.js';
import type { CommonFood, MealHead } from './common-food-engine.js';

type Decision = {
  sourceRecordId: string;
  referenceItemId: string;
  canonicalName: string;
  aliases: string[];
  category: string;
  sourceMapping: { fdcId: number } | null;
  nutritionVector: unknown;
  servingProfile: { servingId: string; label: string; grams: number } | null;
  generatorEligible: boolean;
  componentEligible: boolean;
  outcome: string;
  mealHeadEligibility: MealHead[];
};

const rolesFor = (food: CatalogueFood): CommonFood['roles'] => {
  if (food.foodCategory === 'vegetable') return ['VEGETABLE'];
  if (food.foodCategory === 'legume') return ['PULSE', 'PROTEIN'];
  if (food.foodCategory === 'grain') return ['GRAIN', 'STARCH'];
  if (food.foodCategory === 'dairy') return ['DAIRY', 'PROTEIN', 'BEVERAGE'];
  if (food.foodCategory === 'nuts') return ['NUT_SEED', 'PROTEIN'];
  if (food.foodCategory === 'seeds') return ['NUT_SEED'];
  if (['protein', 'egg', 'fish', 'poultry'].includes(food.foodCategory ?? '')) return ['PROTEIN'];
  return [];
};

const vegetarianClass = (food: CatalogueFood): CommonFood['vegetarianClass'] =>
  food.foodCategory === 'egg'
    ? 'EGG'
    : ['poultry', 'fish'].includes(food.foodCategory ?? '') || food.dietaryTags.includes('non-vegetarian')
      ? 'NON_VEGETARIAN'
      : food.dietaryTags.includes('vegan')
        ? 'VEGAN'
        : 'VEGETARIAN';

export function createFoodUnblockV1731Foods(catalogueFoods: CatalogueFood[], decisions: Decision[]): CommonFood[] {
  const foodsByFdcId = new Map(catalogueFoods.map((food) => [food.fdcId, food]));
  return decisions.flatMap((decision) => {
    if (decision.outcome !== 'ACTIVATED_GENERATOR' || !decision.sourceMapping || !decision.servingProfile || !decision.nutritionVector) return [];
    const food = foodsByFdcId.get(decision.sourceMapping.fdcId);
    if (!food) return [];
    const nutrients = food.nutrients;
    if (!['calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams'].every((key) => Number.isFinite(nutrients[key as keyof typeof nutrients]))) return [];
    const roles = rolesFor(food);
    if (!roles.length) return [];
    return [{
      id: decision.referenceItemId,
      version: 1,
      canonicalCode: `P0_V1731_USDA_${decision.sourceMapping.fdcId}`,
      canonicalName: decision.canonicalName.toLowerCase(),
      displayName: decision.canonicalName,
      foodType: 'COMMON_FOOD',
      family: decision.canonicalName.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
      category: food.foodCategory ?? 'uncategorised',
      countryContext: 'GLOBAL_GENERIC',
      isIndianSpecificFood: false,
      sourcePolicyClass: 'GLOBAL_GENERIC_APPROVED',
      sourceMappingId: `USDA_FDC:${decision.sourceMapping.fdcId}`,
      sourceVersion: food.publicationDate,
      vegetarianClass: vegetarianClass(food),
      dietTags: food.dietaryTags,
      allergens: food.allergenTags,
      intolerances: [],
      clinicalTags: [],
      avoidTags: [],
      mealHeads: decision.mealHeadEligibility,
      roles,
      nutrientsPer100g: {
        kcal: nutrients.calories,
        protein: nutrients.proteinGrams,
        carbohydrate: nutrients.carbohydrateGrams,
        fat: nutrients.fatGrams,
        fibre: nutrients.fibreGrams
      },
      servings: [{
        id: decision.servingProfile.servingId,
        version: 1,
        label: decision.servingProfile.label,
        grams: decision.servingProfile.grams,
        millilitres: null,
        unit: 'gram',
        isDefault: true,
        minMultiplier: .5,
        maxMultiplier: 2,
        allowedMultipliers: [.5, 1, 1.5, 2],
        active: true
      }],
      active: true,
      clientConsumable: decision.componentEligible,
      generatorEligible: decision.generatorEligible,
      aliases: [decision.canonicalName.toLowerCase(), ...decision.aliases.map((alias) => alias.toLowerCase()), food.displayName.toLowerCase(), food.canonicalName]
    }];
  });
}

export function applyFoodUnblockV1731Aliases(foods: CommonFood[], decisions: Decision[]): CommonFood[] {
  const aliasesBySource = new Map<string, string[]>();
  for (const decision of decisions) {
    if (decision.outcome !== 'SOURCE_MAPPED_NOT_GENERATOR' || !decision.sourceMapping) continue;
    aliasesBySource.set(`USDA_FDC:${decision.sourceMapping.fdcId}`, [
      decision.canonicalName.toLowerCase(),
      ...decision.aliases.map((alias) => alias.toLowerCase())
    ]);
  }
  if (!aliasesBySource.size) return foods;
  return foods.map((food) => {
    const aliases = aliasesBySource.get(food.sourceMappingId);
    if (!aliases?.length) return food;
    return { ...food, aliases: [...new Set([...food.aliases, ...aliases])] };
  });
}
