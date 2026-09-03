export type SourceStatus = 'APPROVED' | 'RESEARCH_ONLY' | 'REJECTED' | 'NEEDS_REVIEW';
export type ReviewState = 'DRAFT' | 'MEASURED' | 'CALCULATED' | 'VALIDATED' | 'NUTRITION_REVIEW_PENDING' | 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED';
export type MeasurementState = 'INCOMPLETE' | 'COMPLETE' | 'INVALID' | 'FORMULA_DEVIATION' | 'REMEASUREMENT_REQUIRED';
export type StageBState = 'MEASUREMENT_REQUIRED' | 'SOURCE_DEPENDENCY_BLOCKED' | 'READY_FOR_CALCULATION' | 'READY_FOR_STAGE_B_REVIEW' | 'STAGE_B_APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED';

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
  formulaVersion?: string;
  formulaSha256?: string;
  hardContext?: {
    presentComponentCodes: string[];
    absentComponentCodes: string[];
    allergenCodes: string[];
    dietPatterns: string[];
  };
}

export interface StageAFormulaReview {
  preparationId: string;
  formulaVersion: string;
  decision: 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED' | 'PENDING';
  reviewerId: string;
  reviewerQualification: string;
  reviewedAt: string;
  declaration: string;
}

export interface BatchMeasurementAudit {
  operator: string;
  measurementDate: string;
  equipmentId: string;
  scaleResolutionGrams: number;
}

export interface ControlledMeasurement {
  evidenceClassification?: 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE';
  submissionSha256?: string;
  measurementRunId?: string;
  preparationId: string;
  formulaVersion?: string;
  formulaSha256?: string;
  ingredientWeightsGrams: Record<string, number>;
  waterGrams: number;
  oilGrams: number;
  finalPreparedWeightGrams: number;
  servingLabel: string;
  servingWeightGrams: number;
  servingObservationsGrams?: number[];
  pieceWeightObservationsGrams?: number[];
  producedPieceCount?: number;
  waterUse?: 'INGREDIENT' | 'RINSE_DRAINED' | 'NONE';
  operator: string;
  measurementDate: string;
  equipmentId?: string;
  referenceVesselId?: string | null;
  scaleResolutionGrams: number;
  deviations?: string[];
  status?: MeasurementState;
  notes?: string;
}

export interface MeasurementSubmissionValidationResult {
  submissionSha256: string;
  evidenceClassification: 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE';
  errors: string[];
  warnings: string[];
  canonicalMeasurementEligible: boolean;
}

export interface PreparationReview {
  reviewId?: string;
  preparationId: string;
  calculationSha256: string;
  reviewerRole: 'NUTRITION_REVIEWER';
  reviewerId: string;
  reviewedAt: string;
  state: Extract<ReviewState, 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED'>;
  notes: string;
  reviewerQualification?: string;
}

export interface CalculatedPreparation {
  calculationId?: string;
  preparationId: string;
  calculationSha256: string;
  calculationMethodVersion?: string;
  formulaSha256?: string;
  measurementSha256?: string;
  sourceRegistrySha256?: string;
  finalPreparedWeightGrams: number;
  servingWeightGrams: number;
  nutrientsPer100g: NutrientVector;
  nutrientsPerServing: NutrientVector;
  allergens: string[];
  ingredientFoodVersionIds: string[];
}

export interface MeasurementValidationResult {
  state: MeasurementState;
  measurementSha256: string | null;
  errors: string[];
  warnings: string[];
  canonicalServingWeightGrams: number | null;
}

export interface CalculationInputManifest {
  schemaVersion: 'FITEATSY_STAGE_B_INPUT_V1';
  preparationId: string;
  formulaVersion: string;
  formulaSha256: string;
  measurementRunId: string;
  measurementSha256: string;
  calculationMethodVersion: 'FITEATSY_CONTROLLED_PREPARATION_V1';
  sourceRegistrySha256: string;
  ingredientFoodVersionIds: string[];
  actualIngredientWeightsGrams: Record<string, number>;
  finalPreparedWeightGrams: number;
  servingWeightGrams: number;
}

export interface StageBFoodStatus {
  preparationId: string;
  state: StageBState;
  blockerCodes: string[];
  measurementState: MeasurementState;
  measurementSha256: string | null;
  calculationSha256: string | null;
  reviewState: PreparationReview['state'] | 'NOT_FOUND';
}
