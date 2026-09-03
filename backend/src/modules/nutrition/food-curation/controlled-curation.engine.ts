import crypto from 'node:crypto';
import type { CalculatedPreparation, ControlledMeasurement, ControlledPreparationSpec, FoodSourceRegistryEntry, IngredientFact, NutrientCode, NutrientVector, PreparationReview } from './controlled-curation.types.js';

const CORE: NutrientCode[] = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fibre_g'];
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
};
export const calculationSha256 = (value: unknown) => crypto.createHash('sha256').update(stable(value)).digest('hex');

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

export const validateMeasurement = (spec: ControlledPreparationSpec, measurement: ControlledMeasurement) => {
  if (measurement.preparationId !== spec.preparationId) throw new Error('CURATION_MEASUREMENT_PREPARATION_MISMATCH');
  if (!(measurement.finalPreparedWeightGrams > 0) || !(measurement.servingWeightGrams > 0) || !(measurement.scaleResolutionGrams > 0)) throw new Error('CURATION_INVALID_MEASUREMENT_WEIGHT');
  if (!measurement.operator.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(measurement.measurementDate)) throw new Error('CURATION_INVALID_MEASUREMENT_AUDIT');
  for (const item of spec.ingredients) {
    const measured = measurement.ingredientWeightsGrams[item.ingredientFoodVersionId];
    if (!(measured >= 0) || measured !== item.quantityGrams) throw new Error(`CURATION_INGREDIENT_MEASUREMENT_MISMATCH:${item.ingredientFoodVersionId}`);
  }
};

const scale = (nutrients: NutrientVector, factor: number): NutrientVector => Object.fromEntries(Object.entries(nutrients).map(([code, value]) => [code, value == null ? null : value * factor])) as NutrientVector;

export const calculateControlledPreparation = (spec: ControlledPreparationSpec, measurement: ControlledMeasurement, ingredients: IngredientFact[], registry: FoodSourceRegistryEntry[]): CalculatedPreparation => {
  validateMeasurement(spec, measurement);
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
    for (const { item, fact } of resolved) {
      const value = fact.nutrients[code];
      if (value == null) unknown = true;
      else sum += value * item.quantityGrams / fact.basisGrams;
    }
    totals[code] = unknown ? null : sum;
  }
  const per100g = scale(totals, 100 / measurement.finalPreparedWeightGrams);
  const perServing = scale(per100g, measurement.servingWeightGrams / 100);
  const hashInput = { method: 'FITEATSY_CONTROLLED_PREPARATION_V1', spec, measurement, ingredientVersions: resolved.map(({ fact }) => ({ id: fact.foodVersionId, nutrients: fact.nutrients, sourceId: fact.sourceId, sourceRecordId: fact.sourceRecordId })) };
  return {
    preparationId: spec.preparationId,
    calculationSha256: calculationSha256(hashInput),
    finalPreparedWeightGrams: measurement.finalPreparedWeightGrams,
    servingWeightGrams: measurement.servingWeightGrams,
    nutrientsPer100g: per100g,
    nutrientsPerServing: perServing,
    allergens: [...new Set(resolved.flatMap(({ fact }) => fact.allergens))].sort(),
    ingredientFoodVersionIds: resolved.map(({ fact }) => fact.foodVersionId),
  };
};

export const assertCurrentApproval = (calculated: CalculatedPreparation, review: PreparationReview | null) => {
  if (!review || review.state !== 'APPROVED') throw new Error('CURATION_EXPERT_APPROVAL_REQUIRED');
  if (review.calculationSha256 !== calculated.calculationSha256) throw new Error('CURATION_STALE_APPROVAL');
};
