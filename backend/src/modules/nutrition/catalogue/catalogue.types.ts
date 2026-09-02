export const NUTRITION_CATALOGUE_VERSION = 'FITEATSY-NUTRITION-CATALOGUE-v1.1' as const;

export type NullableNutrientMap = Record<string, number | null>;

export type CatalogueFood = {
  id: string;
  fdcId: number;
  canonicalName: string;
  displayName: string;
  dataType: string;
  publicationDate: string;
  foodCategory: string | null;
  nutrients: NullableNutrientMap;
  cuisineTags: string[];
  dietaryTags: string[];
  allergenTags: string[];
  portions: Array<{ id: string; label: string; grams: number }>;
};

export type CatalogueRecipeComponent = {
  foodId: string;
  quantityGrams: number;
  retentionFactors?: Record<string, number>;
};

export type CatalogueRecipe = {
  id: string;
  code: string;
  displayName: string;
  description: string;
  yieldGrams: number;
  portions: number;
  cuisineTags: string[];
  dietaryTags: string[];
  allergenTags: string[];
  retentionMethod: string | null;
  components: CatalogueRecipeComponent[];
  nutritionTotals: NullableNutrientMap;
};

export type CatalogueMealVariant = {
  id: string;
  mealKey: string;
  name: string;
  description: string;
  householdLabel: string;
  cuisineTags: string[];
  dietaryTags: string[];
  allergenTags: string[];
  recipeId: string;
  portionMultiplier: number;
  nutritionTotals: NullableNutrientMap;
};

export type NutritionCatalogueManifest = {
  catalogueVersion: typeof NUTRITION_CATALOGUE_VERSION;
  source: {
    name: 'USDA FoodData Central';
    license: 'CC0-1.0';
    url: string;
    releases: Array<{ dataType: string; release: string; downloadedFrom: string }>;
  };
  generatedAt: string;
  foods: CatalogueFood[];
  recipes: CatalogueRecipe[];
  mealVariants: CatalogueMealVariant[];
};
