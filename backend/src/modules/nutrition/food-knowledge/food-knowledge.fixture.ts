import type { FoodKnowledgeManifest } from './food-knowledge.types.js';
import { FOOD_KNOWLEDGE_RELEASE_VERSION } from './food-knowledge.types.js';

const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const sourceId = uuid(1);

const nutrientDefinitions: FoodKnowledgeManifest['nutrients'] = [
  ['energy_kcal', 'Energy', 'kcal', 'energy'],
  ['protein_g', 'Protein', 'g', 'macro'],
  ['carbohydrate_g', 'Carbohydrate', 'g', 'macro'],
  ['fat_g', 'Fat', 'g', 'macro'],
  ['fibre_g', 'Fibre', 'g', 'fibre'],
  ['calcium_mg', 'Calcium', 'mg', 'mineral'],
  ['iron_mg', 'Iron', 'mg', 'mineral'],
  ['vitamin_c_mg', 'Vitamin C', 'mg', 'vitamin'],
].map(([code, name, unit, category], index) => ({ id: uuid(100 + index), code, name, unit, category, displayOrder: index })) as FoodKnowledgeManifest['nutrients'];

const families: FoodKnowledgeManifest['families'] = [
  { id: uuid(200), code: 'VEGETABLE_PREPARATIONS', name: 'Vegetable Preparations', parentId: null, kind: 'preparation' },
  { id: uuid(201), code: 'BHINDI', name: 'Bhindi', parentId: uuid(200), kind: 'produce' },
  { id: uuid(202), code: 'ALLIUM', name: 'Allium', parentId: null, kind: 'produce' },
  { id: uuid(203), code: 'ROOT_TUBER', name: 'Root and Tuber', parentId: null, kind: 'produce' },
  { id: uuid(204), code: 'WHEAT_STAPLE', name: 'Wheat Staple', parentId: null, kind: 'staple' },
  { id: uuid(205), code: 'MILLET_STAPLE', name: 'Millet Staple', parentId: null, kind: 'staple' },
  { id: uuid(206), code: 'RICE_STAPLE', name: 'Rice Staple', parentId: null, kind: 'staple' },
  { id: uuid(207), code: 'PULSE_PROTEIN', name: 'Pulse Protein', parentId: null, kind: 'protein' },
  { id: uuid(208), code: 'SOY_PROTEIN', name: 'Soy Protein', parentId: null, kind: 'protein' },
  { id: uuid(209), code: 'DAIRY_PROTEIN', name: 'Dairy Protein', parentId: null, kind: 'protein' },
  { id: uuid(210), code: 'BREAKFAST_PREPARATIONS', name: 'Breakfast Preparations', parentId: null, kind: 'preparation' },
  { id: uuid(211), code: 'SNACK_PREPARATIONS', name: 'Snack Preparations', parentId: null, kind: 'preparation' },
];

const cuisines: FoodKnowledgeManifest['cuisines'] = [
  { id: uuid(300), code: 'INDIAN', name: 'Indian', parentId: null },
  { id: uuid(301), code: 'NORTH_INDIAN', name: 'North Indian', parentId: uuid(300) },
  { id: uuid(302), code: 'SOUTH_INDIAN', name: 'South Indian', parentId: uuid(300) },
  { id: uuid(303), code: 'WEST_INDIAN', name: 'West Indian', parentId: uuid(300) },
  { id: uuid(304), code: 'MAHARASHTRIAN', name: 'Maharashtrian', parentId: uuid(303) },
  { id: uuid(305), code: 'GUJARATI', name: 'Gujarati', parentId: uuid(303) },
  { id: uuid(306), code: 'INDIAN_HOME_STYLE', name: 'Indian Home-Style', parentId: uuid(300) },
];

const allergens: FoodKnowledgeManifest['allergens'] = [
  { id: uuid(400), code: 'MILK', name: 'Milk / Dairy' },
  { id: uuid(401), code: 'SOY', name: 'Soy' },
  { id: uuid(402), code: 'WHEAT_GLUTEN', name: 'Wheat / Gluten' },
  { id: uuid(403), code: 'PEANUT', name: 'Peanut' },
];

const contextTags: FoodKnowledgeManifest['contextTags'] = [
  { id: uuid(500), code: 'SWEET', name: 'Sweet', category: 'SENSORY', parentId: null },
  { id: uuid(501), code: 'SAVOURY', name: 'Savoury', category: 'SENSORY', parentId: null },
  { id: uuid(502), code: 'CRUNCHY', name: 'Crunchy', category: 'SENSORY', parentId: null },
  { id: uuid(503), code: 'SPICY', name: 'Spicy', category: 'SENSORY', parentId: null },
  { id: uuid(504), code: 'QUICK', name: 'Quick', category: 'PRACTICALITY', parentId: null },
  { id: uuid(505), code: 'OFFICE_FRIENDLY', name: 'Office-Friendly', category: 'PRACTICALITY', parentId: null },
  { id: uuid(506), code: 'RESTAURANT_COMMON', name: 'Restaurant Common', category: 'EATING_OUT', parentId: null },
  { id: uuid(507), code: 'STEAMED', name: 'Steamed', category: 'COOKING_METHOD', parentId: null },
];

type FixtureFood = FoodKnowledgeManifest['foods'][number];
type FoodInput = {
  id: number; code: string; name: string; family: number; type: string; consumable?: boolean;
  nutrients?: Record<string, number | null>; serving?: [string, number]; cuisines?: string[];
  components?: Array<[number, FixtureFood['version']['components'][number]['role']]>;
  diets?: string[]; profiles?: Array<[string, 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNKNOWN']>;
  allergens?: Array<[string, 'PRESENT' | 'ABSENT_VERIFIED' | 'UNKNOWN']>;
  meals?: string[]; contexts?: string[]; aliases?: string[];
};

const core = (energy: number, protein: number, carbohydrate: number, fat: number, fibre: number, extra: Record<string, number | null> = {}) => ({
  energy_kcal: energy, protein_g: protein, carbohydrate_g: carbohydrate, fat_g: fat, fibre_g: fibre, ...extra,
});

const makeFood = (input: FoodInput): FixtureFood => {
  const foodId = uuid(1000 + input.id);
  const versionId = uuid(2000 + input.id);
  const consumable = input.consumable ?? true;
  const nutrients = input.nutrients ?? {};
  return {
    id: foodId,
    canonicalCode: input.code,
    canonicalName: input.name,
    displayName: input.name,
    aliases: input.aliases ?? [],
    familyId: uuid(input.family),
    foodType: input.type,
    clientConsumable: consumable,
    version: {
      id: versionId,
      number: 1,
      verificationStatus: 'verified',
      nutritionStatus: ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fibre_g'].every((code) => nutrients[code] != null) ? 'COMPLETE' : Object.values(nutrients).some((value) => value != null) ? 'PARTIAL' : 'UNKNOWN',
      productionEligible: consumable,
      sourceId,
      sourceRecordId: `synthetic-${input.code}`,
      nutrients,
      servings: input.serving ? [
        { id: uuid(3000 + input.id), code: input.serving[0].toUpperCase().replace(/[^A-Z0-9]+/g, '_'), name: input.serving[0], grams: input.serving[1], canonical: true, clientFriendly: true, minimum: 0.5, maximum: 3, increment: 0.5 },
      ] : [],
      components: (input.components ?? []).map(([componentId, role], index) => ({ id: uuid(4000 + input.id * 10 + index), foodId: uuid(1000 + componentId), role, grams: null })),
      cuisines: input.cuisines ?? ['INDIAN_HOME_STYLE'],
      compatibilities: [
        ...(input.diets ?? ['VEGETARIAN', 'VEGAN', 'EGGETARIAN', 'NON_VEGETARIAN']).map((code, index) => ({ id: uuid(5000 + input.id * 10 + index), dimension: 'DIET_PATTERN' as const, code, status: 'COMPATIBLE' as const, rationale: 'Synthetic fixture composition contract.' })),
        ...(input.profiles ?? []).map(([code, status], index) => ({ id: uuid(6000 + input.id * 10 + index), dimension: 'PREPARATION_PROFILE' as const, code, status, rationale: 'Synthetic fixture preparation contract.' })),
      ],
      allergens: (input.allergens ?? []).map(([allergenCode, status]) => ({ allergenCode, status })),
      mealSuitability: (input.meals ?? []).map((mealKey) => ({ mealKey, suitability: 'PRIMARY' as const })),
      contextTags: input.contexts ?? [],
    },
  };
};

export const FOOD_KNOWLEDGE_FIXTURE_MANIFEST: FoodKnowledgeManifest = {
  releaseVersion: FOOD_KNOWLEDGE_RELEASE_VERSION,
  predecessorVersion: null,
  sources: [{
    id: sourceId,
    code: 'SYNTHETIC_ARCHITECTURE_FIXTURE',
    name: 'Fiteatsy Synthetic Architecture Fixture',
    version: '1',
    url: null,
    licenceCode: 'INTERNAL_SYNTHETIC',
    licenceStatus: 'APPROVED',
    attributionText: null,
  }],
  families,
  cuisines,
  nutrients: nutrientDefinitions,
  allergens,
  contextTags,
  foods: [
    makeFood({ id: 1, code: 'GARLIC_RAW', name: 'Garlic', family: 202, type: 'INGREDIENT_ONLY', consumable: false, nutrients: { energy_kcal: 149 }, aliases: ['Lahsun'] }),
    makeFood({ id: 2, code: 'ONION_RAW', name: 'Onion', family: 202, type: 'INGREDIENT_ONLY', consumable: false, nutrients: { energy_kcal: 40 } }),
    makeFood({ id: 3, code: 'POTATO_RAW', name: 'Potato', family: 203, type: 'INGREDIENT_ONLY', consumable: false, nutrients: { energy_kcal: 77 } }),
    makeFood({ id: 4, code: 'BHINDI_RAW', name: 'Bhindi', family: 201, type: 'INGREDIENT_ONLY', consumable: false, nutrients: { energy_kcal: 33 }, aliases: ['Okra', 'Lady Finger'] }),
    makeFood({ id: 5, code: 'BHINDI_SABJI', name: 'Bhindi Sabji', family: 201, type: 'SABJI', nutrients: core(96, 2.4, 12.1, 5.1, 4.2, { vitamin_c_mg: 14 }), serving: ['1 katori', 150], components: [[4, 'PRIMARY'], [2, 'SECONDARY']], profiles: [['NO_ONION', 'INCOMPATIBLE'], ['NO_GARLIC', 'COMPATIBLE'], ['JAIN', 'INCOMPATIBLE']], meals: ['lunch', 'dinner'], contexts: ['SAVOURY'], cuisines: ['MAHARASHTRIAN', 'INDIAN_HOME_STYLE'] }),
    makeFood({ id: 6, code: 'BHINDI_ALOO', name: 'Bhindi Aloo', family: 201, type: 'SABJI', nutrients: core(121, 2.5, 18.4, 5.2, 4), serving: ['1 katori', 150], components: [[4, 'PRIMARY'], [3, 'SECONDARY']], profiles: [['NO_ONION', 'COMPATIBLE'], ['NO_GARLIC', 'COMPATIBLE'], ['JAIN', 'INCOMPATIBLE']], meals: ['lunch', 'dinner'], contexts: ['SAVOURY'], cuisines: ['NORTH_INDIAN', 'INDIAN_HOME_STYLE'] }),
    makeFood({ id: 7, code: 'CHAPATI', name: 'Chapati', family: 204, type: 'INDIAN_BREAD', nutrients: core(297, 9.6, 55.8, 4.2, 8.9), serving: ['1 chapati', 40], allergens: [['WHEAT_GLUTEN', 'PRESENT']], meals: ['lunch', 'dinner'], contexts: ['OFFICE_FRIENDLY'], cuisines: ['NORTH_INDIAN', 'INDIAN_HOME_STYLE'], aliases: ['Roti'] }),
    makeFood({ id: 8, code: 'JOWAR_BHAKRI', name: 'Jowar Bhakri', family: 205, type: 'INDIAN_BREAD', nutrients: core(329, 10.4, 72.6, 3.1, 6.7), serving: ['1 bhakri', 60], meals: ['lunch', 'dinner'], cuisines: ['MAHARASHTRIAN'] }),
    makeFood({ id: 9, code: 'PLAIN_RICE', name: 'Plain Cooked Rice', family: 206, type: 'RICE_GRAIN', nutrients: core(130, 2.7, 28.2, 0.3, 0.4), serving: ['1 katori', 150], meals: ['lunch', 'dinner'], cuisines: ['INDIAN_HOME_STYLE'] }),
    makeFood({ id: 10, code: 'TOOR_DAL', name: 'Prepared Toor Dal', family: 207, type: 'DAL_PULSE', nutrients: core(121, 6.8, 18.4, 2.4, 5.1, { iron_mg: 1.8 }), serving: ['1 katori', 150], meals: ['lunch', 'dinner'], cuisines: ['INDIAN_HOME_STYLE'] }),
    makeFood({ id: 11, code: 'TOFU', name: 'Tofu', family: 208, type: 'PROTEIN', nutrients: core(144, 17.3, 2.8, 8.7, 2.3, { calcium_mg: 350 }), serving: ['100 g', 100], allergens: [['SOY', 'PRESENT']], meals: ['breakfast', 'lunch', 'dinner'], cuisines: ['INDIAN_HOME_STYLE'] }),
    makeFood({ id: 12, code: 'PANEER', name: 'Paneer', family: 209, type: 'DAIRY', nutrients: core(321, 21.4, 3.6, 25, 0, { calcium_mg: 480 }), serving: ['100 g', 100], diets: ['VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], allergens: [['MILK', 'PRESENT'], ['SOY', 'ABSENT_VERIFIED']], meals: ['breakfast', 'lunch', 'dinner'], cuisines: ['NORTH_INDIAN', 'INDIAN_HOME_STYLE'] }),
    makeFood({ id: 13, code: 'CURD', name: 'Curd', family: 209, type: 'DAIRY', nutrients: core(61, 3.5, 4.7, 3.3, 0, { calcium_mg: 121 }), serving: ['1 katori', 150], diets: ['VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], allergens: [['MILK', 'PRESENT']], meals: ['breakfast', 'lunch', 'eveningSnack', 'dinner'], cuisines: ['INDIAN_HOME_STYLE'], aliases: ['Dahi'] }),
    makeFood({ id: 14, code: 'MILK', name: 'Milk', family: 209, type: 'DAIRY', nutrients: core(61, 3.2, 4.8, 3.3, 0, { calcium_mg: 113 }), serving: ['1 glass', 200], diets: ['VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], allergens: [['MILK', 'PRESENT']], meals: ['earlyMorning', 'breakfast', 'bedtimeNutrition'], contexts: ['QUICK'], cuisines: ['INDIAN_HOME_STYLE'] }),
    makeFood({ id: 15, code: 'IDLI', name: 'Idli', family: 210, type: 'BREAKFAST', nutrients: core(146, 4.5, 28.5, 1, 2), serving: ['2 pieces', 100], meals: ['breakfast', 'eveningSnack'], contexts: ['SAVOURY', 'OFFICE_FRIENDLY', 'STEAMED'], cuisines: ['SOUTH_INDIAN'] }),
    makeFood({ id: 16, code: 'ROASTED_CHANA', name: 'Roasted Chana', family: 211, type: 'SNACK', nutrients: core(370, 20.8, 58, 5.6, 17), serving: ['1 handful', 30], meals: ['midMorningSnack', 'eveningSnack'], contexts: ['SAVOURY', 'CRUNCHY', 'OFFICE_FRIENDLY'], cuisines: ['NORTH_INDIAN', 'INDIAN_HOME_STYLE'] }),
    makeFood({ id: 17, code: 'SHRIKHAND', name: 'Shrikhand', family: 209, type: 'DAIRY', nutrients: core(220, 7, 32, 7, 0), serving: ['1 small katori', 100], diets: ['VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], allergens: [['MILK', 'PRESENT']], meals: ['eveningSnack'], contexts: ['SWEET'], cuisines: ['MAHARASHTRIAN'] }),
    makeFood({ id: 18, code: 'GARLIC_BHINDI', name: 'Garlic Bhindi', family: 201, type: 'SABJI', nutrients: core(102, 2.5, 12.4, 5.5, 4.1), serving: ['1 katori', 150], components: [[4, 'PRIMARY'], [1, 'SEASONING']], profiles: [['NO_ONION', 'COMPATIBLE'], ['NO_GARLIC', 'INCOMPATIBLE'], ['JAIN', 'INCOMPATIBLE']], meals: ['lunch', 'dinner'], contexts: ['SAVOURY', 'SPICY'], cuisines: ['INDIAN_HOME_STYLE'] }),
  ],
};
