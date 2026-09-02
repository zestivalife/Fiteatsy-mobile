export const FOOD_KNOWLEDGE_RELEASE_VERSION = 'FITEATSY-FOOD-KNOWLEDGE-v1-fixture' as const;

export type FoodKnowledgeNutritionStatus = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
export type FoodKnowledgeLicenceStatus = 'APPROVED' | 'ATTRIBUTION_REQUIRED' | 'SHARE_ALIKE_REVIEW' | 'REFERENCE_ONLY' | 'UNKNOWN_BLOCKED';
export type FoodKnowledgeCompatibilityStatus = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNKNOWN';
export type FoodKnowledgeAllergenStatus = 'PRESENT' | 'ABSENT_VERIFIED' | 'UNKNOWN';

export type FoodKnowledgeManifest = {
  releaseVersion: string;
  predecessorVersion: string | null;
  sources: Array<{
    id: string;
    code: string;
    name: string;
    version: string;
    url: string | null;
    licenceCode: string;
    licenceStatus: FoodKnowledgeLicenceStatus;
    attributionText: string | null;
  }>;
  families: Array<{ id: string; code: string; name: string; parentId: string | null; kind: 'food' | 'preparation' | 'staple' | 'protein' | 'produce' }>;
  cuisines: Array<{ id: string; code: string; name: string; parentId: string | null }>;
  nutrients: Array<{ id: string; code: string; name: string; unit: string; category: 'energy' | 'macro' | 'fibre' | 'mineral' | 'vitamin' | 'other'; displayOrder: number }>;
  allergens: Array<{ id: string; code: string; name: string }>;
  contextTags: Array<{ id: string; code: string; name: string; category: 'SENSORY' | 'PRACTICALITY' | 'EATING_OUT' | 'MEAL_CONTEXT' | 'COOKING_METHOD'; parentId: string | null }>;
  foods: Array<{
    id: string;
    canonicalCode: string;
    canonicalName: string;
    displayName: string;
    aliases: string[];
    familyId: string | null;
    foodType: string;
    clientConsumable: boolean;
    version: {
      id: string;
      number: number;
      verificationStatus: 'draft' | 'reviewed' | 'verified' | 'rejected';
      nutritionStatus: FoodKnowledgeNutritionStatus;
      productionEligible: boolean;
      sourceId: string;
      sourceRecordId: string;
      nutrients: Record<string, number | null>;
      servings: Array<{ id: string; code: string; name: string; grams: number; canonical: boolean; clientFriendly: boolean; minimum: number | null; maximum: number | null; increment: number | null }>;
      components: Array<{ id: string; foodId: string; role: 'PRIMARY' | 'SECONDARY' | 'COOKING_COMPONENT' | 'SEASONING' | 'ACCOMPANIMENT_COMPONENT'; grams: number | null }>;
      cuisines: string[];
      compatibilities: Array<{ id: string; dimension: 'DIET_PATTERN' | 'PREPARATION_PROFILE'; code: string; status: FoodKnowledgeCompatibilityStatus; rationale: string }>;
      allergens: Array<{ allergenCode: string; status: FoodKnowledgeAllergenStatus }>;
      mealSuitability: Array<{ mealKey: string; suitability: 'PRIMARY' | 'COMPONENT' | 'OPTIONAL' | 'UNSUITABLE' }>;
      contextTags: string[];
    };
  }>;
};

export type FoodKnowledgeImportResult = {
  releaseVersion: string;
  manifestSha256: string;
  writes: number;
  conflicts: string[];
  invalidRecords: string[];
  counts: { foods: number; versions: number; servings: number; nutrients: number; families: number };
};

export type FoodKnowledgeValidationIssue = { code: string; path: string; message: string };

export type FoodKnowledgeValidationResult = {
  valid: boolean;
  issues: FoodKnowledgeValidationIssue[];
};

export type FoodKnowledgeQuery = {
  mealKey?: string;
  dietPattern?: string;
  preparationProfiles?: string[];
  excludeComponentFoodIds?: string[];
  excludeAllergenCodes?: string[];
  cuisineCodes?: string[];
  contextCodes?: string[];
  limit?: number;
};
