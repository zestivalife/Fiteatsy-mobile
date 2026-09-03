export type SourceStatus = 'APPROVED' | 'RESEARCH_ONLY' | 'REJECTED' | 'NEEDS_REVIEW';
export type ReviewState = 'DRAFT' | 'MEASURED' | 'CALCULATED' | 'VALIDATED' | 'NUTRITION_REVIEW_PENDING' | 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED';

export interface FoodSourceRegistryEntry {
  id: string;
  name: string;
  publisher: string;
  datasetVersion: string;
  licence: string;
  commercialUse: 'YES' | 'NO' | 'UNKNOWN';
  redistribution: 'YES' | 'NO' | 'UNKNOWN';
  modification: 'YES' | 'NO' | 'UNKNOWN';
  attribution: string | null;
  reference: string;
  artefactSha256: string | null;
  status: SourceStatus;
  reviewNotes: string;
}

export type NutrientCode = 'energy_kcal' | 'protein_g' | 'carbohydrate_g' | 'fat_g' | 'fibre_g' | 'calcium_mg' | 'iron_mg' | 'vitamin_c_mg';
export type NutrientVector = Partial<Record<NutrientCode, number | null>>;

export interface IngredientFact {
  foodId: string;
  foodVersionId: string;
  canonicalName: string;
  sourceId: string;
  sourceRecordId: string;
  basisGrams: number;
  nutrients: NutrientVector;
  allergens: string[];
}

export interface PreparationIngredient {
  ingredientFoodVersionId: string;
  quantityGrams: number;
  role: 'PRIMARY' | 'SECONDARY' | 'FAT' | 'SEASONING';
}

export interface ControlledPreparationSpec {
  preparationId: string;
  canonicalFoodId: string;
  proposedCanonicalName: string;
  referenceBatchName: string;
  ingredients: PreparationIngredient[];
  preparationMethod: 'BOILED' | 'PRESSURE_COOKED' | 'PAN_COOKED' | 'GRIDDLE_COOKED' | 'STEAMED' | 'MIXED';
  proposedWaterGrams: number;
  yieldMethod: 'CONTROLLED_MEASUREMENT';
  proposedServingLabel: string;
  foodFamily: string;
  mealKeys: string[];
  reviewState: ReviewState;
  formulaNotice: 'PROPOSED — REQUIRES NUTRITION REVIEW';
}

export interface ControlledMeasurement {
  preparationId: string;
  ingredientWeightsGrams: Record<string, number>;
  waterGrams: number;
  oilGrams: number;
  finalPreparedWeightGrams: number;
  servingLabel: string;
  servingWeightGrams: number;
  operator: string;
  measurementDate: string;
  scaleResolutionGrams: number;
}

export interface PreparationReview {
  preparationId: string;
  calculationSha256: string;
  reviewerRole: 'NUTRITION_REVIEWER';
  reviewerId: string;
  reviewedAt: string;
  state: Extract<ReviewState, 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED'>;
  notes: string;
}

export interface CalculatedPreparation {
  preparationId: string;
  calculationSha256: string;
  finalPreparedWeightGrams: number;
  servingWeightGrams: number;
  nutrientsPer100g: NutrientVector;
  nutrientsPerServing: NutrientVector;
  allergens: string[];
  ingredientFoodVersionIds: string[];
}
