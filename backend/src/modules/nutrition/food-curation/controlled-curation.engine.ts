import crypto from 'node:crypto';
import type { CalculatedPreparation, CalculationInputManifest, ControlledMeasurement, ControlledPreparationSpec, FoodSourceRegistryEntry, IngredientFact, MeasurementSubmissionValidationResult, MeasurementValidationResult, NutrientCode, NutrientVector, PreparationReview, StageBFoodStatus } from './controlled-curation.types.js';

const CORE: NutrientCode[] = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fibre_g'];
export const CALCULATION_METHOD_VERSION = 'FITEATSY_CONTROLLED_PREPARATION_V1' as const;
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
};
export const calculationSha256 = (value: unknown) => crypto.createHash('sha256').update(stable(value)).digest('hex');
const deterministicUuid = (sha256: string) => `${sha256.slice(0, 8)}-${sha256.slice(8, 12)}-4${sha256.slice(13, 16)}-a${sha256.slice(17, 20)}-${sha256.slice(20, 32)}`;
export const formulaSha256 = (spec: ControlledPreparationSpec) => calculationSha256({
  preparationId: spec.preparationId,
  canonicalFoodId: spec.canonicalFoodId,
  ingredients: spec.ingredients,
  preparationMethod: spec.preparationMethod,
  proposedWaterGrams: spec.proposedWaterGrams,
  proposedServingLabel: spec.proposedServingLabel,
  hardContext: spec.hardContext ?? null,
  formulaVersion: spec.formulaVersion ?? 'UNVERSIONED',
});

export const normalizeQuantityToGrams = (amount: number, unit: 'g' | 'mg' | 'µg' | 'ml', densityGramsPerMl?: number) => {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('CURATION_INVALID_QUANTITY');
  if (unit === 'g') return amount;
  if (unit === 'mg') return amount / 1_000;
  if (unit === 'µg') return amount / 1_000_000;
  if (!(densityGramsPerMl && densityGramsPerMl > 0)) throw new Error('CURATION_DENSITY_REQUIRED');
  return amount * densityGramsPerMl;
};

export const assertApprovedIngredient = (ingredient: IngredientFact, sources: Map<string, FoodSourceRegistryEntry>) => {
  const source = sources.get(ingredient.sourceId);
  if (!source || source.status !== 'APPROVED' || source.commercialUse !== 'YES' || source.redistribution !== 'YES' || source.modification !== 'YES') throw new Error(`CURATION_SOURCE_NOT_APPROVED:${ingredient.sourceId}`);
  if (!(ingredient.basisGrams > 0)) throw new Error(`CURATION_INVALID_BASIS:${ingredient.foodVersionId}`);
  for (const nutrient of CORE) if (ingredient.nutrients[nutrient] == null) throw new Error(`CURATION_CORE_NUTRIENT_UNKNOWN:${ingredient.foodVersionId}:${nutrient}`);
  for (const [code, value] of Object.entries(ingredient.nutrients)) if (value != null && (!Number.isFinite(value) || value < 0)) throw new Error(`CURATION_INVALID_NUTRIENT:${ingredient.foodVersionId}:${code}`);
};

const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const isSha256 = (value: string | undefined) => Boolean(value && /^[a-f0-9]{64}$/i.test(value));

export const inspectMeasurementSubmission = (measurement: ControlledMeasurement): MeasurementSubmissionValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (measurement.evidenceClassification !== 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE') errors.push('CURATION_EVIDENCE_CLASSIFICATION_INVALID');
  if (!(measurement.finalPreparedWeightGrams > 0)) errors.push('CURATION_INVALID_MEASUREMENT_WEIGHT');
  if (!(measurement.servingWeightGrams > 0)) errors.push('CURATION_INVALID_SERVING_WEIGHT');
  for (const [id, value] of Object.entries(measurement.ingredientWeightsGrams)) {
    if (!Number.isFinite(value) || value < 0) errors.push(`CURATION_INVALID_SUBMITTED_INGREDIENT:${id}`);
  }
  if (!Number.isFinite(measurement.waterGrams) || measurement.waterGrams < 0 || !Number.isFinite(measurement.oilGrams) || measurement.oilGrams < 0) errors.push('CURATION_INVALID_SUBMITTED_LIQUID_OR_FAT');
  const observations = measurement.pieceWeightObservationsGrams?.length ? measurement.pieceWeightObservationsGrams : measurement.servingObservationsGrams;
  if (!observations?.length || observations.some((value) => !Number.isFinite(value) || value <= 0)) errors.push('CURATION_SERVING_EVIDENCE_INCOMPLETE');
  if (measurement.pieceWeightObservationsGrams) {
    if (!Number.isInteger(measurement.producedPieceCount) || measurement.producedPieceCount! <= 0) errors.push('CURATION_PRODUCED_PIECE_COUNT_REQUIRED');
    if (measurement.producedPieceCount !== measurement.pieceWeightObservationsGrams.length) errors.push('CURATION_PRODUCED_PIECE_OBSERVATION_MISMATCH');
    const pieceTotal = measurement.pieceWeightObservationsGrams.reduce((sum, value) => sum + value, 0);
    if (pieceTotal !== measurement.finalPreparedWeightGrams) errors.push('CURATION_PIECE_BATCH_WEIGHT_MISMATCH');
    if (measurement.pieceWeightObservationsGrams.length < 5) errors.push('CURATION_PIECE_PROTOCOL_MINIMUM_NOT_MET');
  } else if ((observations?.length ?? 0) < 3) errors.push('CURATION_SERVING_EVIDENCE_INCOMPLETE');
  if (measurement.waterUse === 'RINSE_DRAINED') warnings.push('CURATION_DRAINED_RINSE_WATER_EXCLUDED_FROM_RETAINED_INGREDIENT_WATER');
  if (!measurement.operator?.trim()) errors.push('CURATION_OPERATOR_REQUIRED');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measurement.measurementDate)) errors.push('CURATION_MEASUREMENT_DATE_REQUIRED');
  if (!measurement.equipmentId?.trim()) errors.push('CURATION_EQUIPMENT_ID_REQUIRED');
  if (!(measurement.scaleResolutionGrams > 0)) errors.push('CURATION_SCALE_RESOLUTION_REQUIRED');
  if (!isSha256(measurement.formulaSha256)) errors.push('CURATION_APPROVED_FORMULA_HASH_REQUIRED');
  const submissionSha256 = calculationSha256({ ...measurement, submissionSha256: undefined, formulaSha256: measurement.formulaSha256 ?? null });
  return { submissionSha256, evidenceClassification: 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE', errors, warnings, canonicalMeasurementEligible: errors.length === 0 };
};

export const inspectMeasurement = (spec: ControlledPreparationSpec, measurement: ControlledMeasurement): MeasurementValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const expectedFormulaSha = spec.formulaSha256 ?? formulaSha256(spec);
  if (measurement.preparationId !== spec.preparationId) errors.push('CURATION_MEASUREMENT_PREPARATION_MISMATCH');
  if (!measurement.measurementRunId?.trim()) errors.push('CURATION_MEASUREMENT_RUN_ID_REQUIRED');
  if (!isSha256(measurement.formulaSha256) || measurement.formulaSha256 !== expectedFormulaSha) errors.push('CURATION_FORMULA_HASH_MISMATCH');
  if (!(measurement.finalPreparedWeightGrams > 0) || !(measurement.scaleResolutionGrams > 0)) errors.push('CURATION_INVALID_MEASUREMENT_WEIGHT');
  if (!measurement.operator?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(measurement.measurementDate) || !measurement.equipmentId?.trim()) errors.push('CURATION_INVALID_MEASUREMENT_AUDIT');
  const expectedIds = new Set(spec.ingredients.map((item) => item.ingredientFoodVersionId));
  for (const item of spec.ingredients) {
    const measured = measurement.ingredientWeightsGrams[item.ingredientFoodVersionId];
    if (!Number.isFinite(measured) || measured < 0) errors.push(`CURATION_INGREDIENT_MEASUREMENT_MISSING:${item.ingredientFoodVersionId}`);
    if ((item.quantityGrams === 0) !== (measured === 0)) errors.push(`CURATION_STRUCTURAL_FORMULA_DEVIATION:${item.ingredientFoodVersionId}`);
    else if (measured !== item.quantityGrams) warnings.push(`CURATION_QUANTITY_DEVIATION:${item.ingredientFoodVersionId}`);
  }
  for (const id of Object.keys(measurement.ingredientWeightsGrams)) if (!expectedIds.has(id)) errors.push(`CURATION_UNEXPECTED_INGREDIENT:${id}`);
  const observations = measurement.pieceWeightObservationsGrams?.length
    ? measurement.pieceWeightObservationsGrams
    : measurement.servingObservationsGrams;
  const requiredRuns = measurement.pieceWeightObservationsGrams ? 5 : 3;
  if (!observations || observations.length < requiredRuns || observations.some((value) => !Number.isFinite(value) || value <= 0)) errors.push('CURATION_SERVING_EVIDENCE_INCOMPLETE');
  const canonicalServingWeightGrams = observations?.length ? mean(observations) : null;
  if (!(measurement.servingWeightGrams > 0) || (canonicalServingWeightGrams != null && measurement.servingWeightGrams !== canonicalServingWeightGrams)) errors.push('CURATION_SERVING_WEIGHT_MISMATCH');
  if (measurement.status && measurement.status !== 'COMPLETE') errors.push(`CURATION_MEASUREMENT_STATE_${measurement.status}`);
  const state = errors.some((code) => code.includes('STRUCTURAL_FORMULA_DEVIATION')) ? 'FORMULA_DEVIATION'
    : errors.length ? (errors.some((code) => code.includes('INCOMPLETE') || code.includes('REQUIRED') || code.includes('MISSING')) ? 'INCOMPLETE' : 'INVALID')
      : 'COMPLETE';
  const hashable = errors.length ? null : {
    measurementRunId: measurement.measurementRunId,
    preparationId: measurement.preparationId,
    formulaVersion: measurement.formulaVersion ?? null,
    formulaSha256: measurement.formulaSha256,
    ingredientWeightsGrams: measurement.ingredientWeightsGrams,
    waterGrams: measurement.waterGrams,
    oilGrams: measurement.oilGrams,
    finalPreparedWeightGrams: measurement.finalPreparedWeightGrams,
    servingLabel: measurement.servingLabel,
    servingWeightGrams: measurement.servingWeightGrams,
    servingObservationsGrams: measurement.servingObservationsGrams ?? null,
    pieceWeightObservationsGrams: measurement.pieceWeightObservationsGrams ?? null,
    producedPieceCount: measurement.producedPieceCount ?? null,
    waterUse: measurement.waterUse ?? null,
    operator: measurement.operator,
    measurementDate: measurement.measurementDate,
    equipmentId: measurement.equipmentId,
    referenceVesselId: measurement.referenceVesselId ?? null,
    scaleResolutionGrams: measurement.scaleResolutionGrams,
    deviations: measurement.deviations ?? [],
  };
  return { state, measurementSha256: hashable ? calculationSha256(hashable) : null, errors, warnings, canonicalServingWeightGrams };
};

export const validateMeasurement = (spec: ControlledPreparationSpec, measurement: ControlledMeasurement) => {
  const result = inspectMeasurement(spec, measurement);
  if (result.errors.length) throw new Error(result.errors[0]);
  return result;
};

const scale = (nutrients: NutrientVector, factor: number): NutrientVector => Object.fromEntries(Object.entries(nutrients).map(([code, value]) => [code, value == null ? null : value * factor])) as NutrientVector;

export const calculateControlledPreparation = (spec: ControlledPreparationSpec, measurement: ControlledMeasurement, ingredients: IngredientFact[], registry: FoodSourceRegistryEntry[]): CalculatedPreparation => {
  const measurementValidation = validateMeasurement(spec, measurement);
  const ingredientMap = new Map(ingredients.map((item) => [item.foodVersionId, item]));
  const sourceMap = new Map(registry.map((item) => [item.id, item]));
  const totals: NutrientVector = {};
  const allCodes = new Set<NutrientCode>();
  const resolved = spec.ingredients.map((item) => {
    const fact = ingredientMap.get(item.ingredientFoodVersionId);
    if (!fact) throw new Error(`CURATION_UNKNOWN_INGREDIENT_VERSION:${item.ingredientFoodVersionId}`);
    assertApprovedIngredient(fact, sourceMap);
    Object.keys(fact.nutrients).forEach((code) => allCodes.add(code as NutrientCode));
    return { item, fact };
  });
  for (const code of allCodes) {
    let sum = 0;
    let unknown = false;
    for (const { fact } of resolved) {
      const value = fact.nutrients[code];
      if (value == null) unknown = true;
      else sum += value * measurement.ingredientWeightsGrams[fact.foodVersionId] / fact.basisGrams;
    }
    totals[code] = unknown ? null : sum;
  }
  const per100g = scale(totals, 100 / measurement.finalPreparedWeightGrams);
  const perServing = scale(per100g, measurement.servingWeightGrams / 100);
  const registrySnapshot = resolved.map(({ fact }) => sourceMap.get(fact.sourceId));
  const sourceRegistrySha256 = calculationSha256(registrySnapshot);
  const resolvedFormulaSha256 = spec.formulaSha256 ?? formulaSha256(spec);
  const hashInput = { method: CALCULATION_METHOD_VERSION, formulaSha256: resolvedFormulaSha256, measurementSha256: measurementValidation.measurementSha256, sourceRegistrySha256, ingredientVersions: resolved.map(({ fact }) => ({ id: fact.foodVersionId, nutrients: fact.nutrients, sourceId: fact.sourceId, sourceRecordId: fact.sourceRecordId })) };
  return {
    calculationId: deterministicUuid(calculationSha256(hashInput)),
    preparationId: spec.preparationId,
    calculationSha256: calculationSha256(hashInput),
    calculationMethodVersion: CALCULATION_METHOD_VERSION,
    formulaSha256: resolvedFormulaSha256,
    measurementSha256: measurementValidation.measurementSha256!,
    sourceRegistrySha256,
    finalPreparedWeightGrams: measurement.finalPreparedWeightGrams,
    servingWeightGrams: measurement.servingWeightGrams,
    nutrientsPer100g: per100g,
    nutrientsPerServing: perServing,
    allergens: [...new Set(resolved.flatMap(({ fact }) => fact.allergens))].sort(),
    ingredientFoodVersionIds: resolved.map(({ fact }) => fact.foodVersionId),
  };
};

export const createCalculationInputManifest = (spec: ControlledPreparationSpec, measurement: ControlledMeasurement, registry: FoodSourceRegistryEntry[]): CalculationInputManifest => {
  const validation = validateMeasurement(spec, measurement);
  return {
    schemaVersion: 'FITEATSY_STAGE_B_INPUT_V1',
    preparationId: spec.preparationId,
    formulaVersion: spec.formulaVersion ?? 'UNVERSIONED',
    formulaSha256: spec.formulaSha256 ?? formulaSha256(spec),
    measurementRunId: measurement.measurementRunId!,
    measurementSha256: validation.measurementSha256!,
    calculationMethodVersion: CALCULATION_METHOD_VERSION,
    sourceRegistrySha256: calculationSha256(registry),
    ingredientFoodVersionIds: spec.ingredients.map((item) => item.ingredientFoodVersionId),
    actualIngredientWeightsGrams: measurement.ingredientWeightsGrams,
    finalPreparedWeightGrams: measurement.finalPreparedWeightGrams,
    servingWeightGrams: measurement.servingWeightGrams,
  };
};

export const deriveStageBStatus = (spec: ControlledPreparationSpec, measurement: ControlledMeasurement | null, calculated: CalculatedPreparation | null, review: PreparationReview | null): StageBFoodStatus => {
  if (!measurement) return { preparationId: spec.preparationId, state: 'MEASUREMENT_REQUIRED', blockerCodes: ['PHYSICAL_MEASUREMENT_EVIDENCE_REQUIRED'], measurementState: 'INCOMPLETE', measurementSha256: null, calculationSha256: null, reviewState: 'NOT_FOUND' };
  const validation = inspectMeasurement(spec, measurement);
  if (validation.state !== 'COMPLETE') return { preparationId: spec.preparationId, state: 'MEASUREMENT_REQUIRED', blockerCodes: validation.errors, measurementState: validation.state, measurementSha256: validation.measurementSha256, calculationSha256: null, reviewState: review?.state ?? 'NOT_FOUND' };
  if (!calculated) return { preparationId: spec.preparationId, state: 'READY_FOR_CALCULATION', blockerCodes: [], measurementState: validation.state, measurementSha256: validation.measurementSha256, calculationSha256: null, reviewState: review?.state ?? 'NOT_FOUND' };
  if (!review) return { preparationId: spec.preparationId, state: 'READY_FOR_STAGE_B_REVIEW', blockerCodes: ['STAGE_B_EXPERT_REVIEW_REQUIRED'], measurementState: validation.state, measurementSha256: validation.measurementSha256, calculationSha256: calculated.calculationSha256, reviewState: 'NOT_FOUND' };
  if (review.state === 'CHANGES_REQUIRED') return { preparationId: spec.preparationId, state: 'CHANGES_REQUIRED', blockerCodes: ['STAGE_B_CHANGES_REQUIRED'], measurementState: validation.state, measurementSha256: validation.measurementSha256, calculationSha256: calculated.calculationSha256, reviewState: review.state };
  if (review.state === 'REJECTED') return { preparationId: spec.preparationId, state: 'REJECTED', blockerCodes: ['STAGE_B_REJECTED'], measurementState: validation.state, measurementSha256: validation.measurementSha256, calculationSha256: calculated.calculationSha256, reviewState: review.state };
  assertCurrentApproval(calculated, review);
  return { preparationId: spec.preparationId, state: 'STAGE_B_APPROVED', blockerCodes: [], measurementState: validation.state, measurementSha256: validation.measurementSha256, calculationSha256: calculated.calculationSha256, reviewState: review.state };
};

export const assertCurrentApproval = (calculated: CalculatedPreparation, review: PreparationReview | null) => {
  if (!review || review.state !== 'APPROVED') throw new Error('CURATION_EXPERT_APPROVAL_REQUIRED');
  if (review.reviewerRole !== 'NUTRITION_REVIEWER' || !review.reviewerId.trim() || !review.reviewerQualification?.trim()) throw new Error('CURATION_REVIEWER_AUTHORITY_REQUIRED');
  if (review.calculationSha256 !== calculated.calculationSha256) throw new Error('CURATION_STALE_APPROVAL');
};

export const reconcileCalculation = (calculated: CalculatedPreparation) => {
  const factor = calculated.servingWeightGrams / 100;
  for (const code of Object.keys(calculated.nutrientsPer100g) as NutrientCode[]) {
    const per100 = calculated.nutrientsPer100g[code];
    const serving = calculated.nutrientsPerServing[code];
    if (per100 == null || serving == null) {
      if (per100 !== serving) throw new Error(`CURATION_RECONCILIATION_UNKNOWN_MISMATCH:${code}`);
    } else if (Math.abs(serving - per100 * factor) > 1e-10) {
      throw new Error(`CURATION_RECONCILIATION_FAILED:${code}`);
    }
  }
  return true;
};
