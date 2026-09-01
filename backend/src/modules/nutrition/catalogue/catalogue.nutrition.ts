import type { CatalogueFood, CatalogueRecipeComponent, NullableNutrientMap } from './catalogue.types.js';

export const roundNutrient = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** A total is unknown when any ingredient value required for that nutrient is unknown. */
export const calculateRecipeNutrition = (
  components: CatalogueRecipeComponent[],
  foodsById: Map<string, CatalogueFood>,
): NullableNutrientMap => {
  const nutrientKeys = new Set<string>();
  components.forEach((component) => {
    const food = foodsById.get(component.foodId);
    Object.keys(food?.nutrients ?? {}).forEach((key) => nutrientKeys.add(key));
  });

  return Object.fromEntries([...nutrientKeys].sort().map((nutrientKey) => {
    let total = 0;
    for (const component of components) {
      const amount = foodsById.get(component.foodId)?.nutrients[nutrientKey];
      if (amount == null || !Number.isFinite(amount)) return [nutrientKey, null];
      const retention = component.retentionFactors?.[nutrientKey] ?? 1;
      total += amount * (component.quantityGrams / 100) * retention;
    }
    return [nutrientKey, roundNutrient(total)];
  }));
};

export const scaleNutrients = (nutrients: NullableNutrientMap, multiplier: number): NullableNutrientMap =>
  Object.fromEntries(Object.entries(nutrients).map(([key, value]) => [
    key,
    value == null ? null : roundNutrient(value * multiplier),
  ]));
