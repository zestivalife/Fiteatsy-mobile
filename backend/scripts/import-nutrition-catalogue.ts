import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertDestructiveTestResetAllowed } from '../src/test-support/destructive-reset-guard.js';
import type { NutritionCatalogueManifest, NullableNutrientMap } from '../src/modules/nutrition/catalogue/catalogue.types.js';

const { Client } = pg;
const defaultManifest = fileURLToPath(new URL('../src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.json', import.meta.url));
const macro = (n: NullableNutrientMap, key: string) => n[key] ?? null;
const micronutrients = (n: NullableNutrientMap) => Object.fromEntries(Object.entries(n).filter(([key]) => !['calories','caloriesKcal','proteinGrams','carbohydrateGrams','fatGrams','fibreGrams'].includes(key)));
const stableUuid = (key: string) => {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  return `${hex.slice(0,8).join('')}-${hex.slice(8,12).join('')}-${hex.slice(12,16).join('')}-${hex.slice(16,20).join('')}-${hex.slice(20).join('')}`;
};

export const importNutritionCatalogue = async (databaseUrl = process.env.DATABASE_URL, manifestPath = defaultManifest) => {
  assertDestructiveTestResetAllowed({ ...process.env, DATABASE_URL: databaseUrl });
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as NutritionCatalogueManifest;
  const sha = createHash('sha256').update(raw).digest('hex');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`insert into nutrition_catalogue_releases (catalogue_version,source_name,source_license,source_releases,manifest_sha256,record_counts,status,imported_at,updated_at)
      values ($1,$2,$3,$4,$5,$6,'active',now(),now()) on conflict (catalogue_version) do update set source_releases=excluded.source_releases,manifest_sha256=excluded.manifest_sha256,record_counts=excluded.record_counts,status='active',imported_at=now(),updated_at=now()`,
      [manifest.catalogueVersion, manifest.source.name, manifest.source.license, JSON.stringify(manifest.source.releases), sha, JSON.stringify({foods:manifest.foods.length,recipes:manifest.recipes.length,mealVariants:manifest.mealVariants.length})]);
    for (const food of manifest.foods) {
      const sourceMetadata = { catalogueVersion: manifest.catalogueVersion, source: manifest.source.name, license: manifest.source.license, fdcId: food.fdcId, dataType: food.dataType, publicationDate: food.publicationDate };
      await client.query(`insert into nutrition_foods (id,canonical_name,display_name,food_category,reference_quantity,reference_unit,calories,protein_grams,carbohydrate_grams,fat_grams,fibre_grams,micronutrients,cuisine_tags,allergen_tags,dietary_tags,source_metadata,verification_status,status,deleted_at,updated_at)
        values ($1,$2,$3,$4,100,'g',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'verified','active',null,now()) on conflict (id) do update set canonical_name=excluded.canonical_name,display_name=excluded.display_name,food_category=excluded.food_category,calories=excluded.calories,protein_grams=excluded.protein_grams,carbohydrate_grams=excluded.carbohydrate_grams,fat_grams=excluded.fat_grams,fibre_grams=excluded.fibre_grams,micronutrients=excluded.micronutrients,cuisine_tags=excluded.cuisine_tags,allergen_tags=excluded.allergen_tags,dietary_tags=excluded.dietary_tags,source_metadata=excluded.source_metadata,verification_status='verified',status='active',deleted_at=null,updated_at=now()`,
        [food.id,food.canonicalName,food.displayName,food.foodCategory,macro(food.nutrients,'calories'),macro(food.nutrients,'proteinGrams'),macro(food.nutrients,'carbohydrateGrams'),macro(food.nutrients,'fatGrams'),macro(food.nutrients,'fibreGrams'),JSON.stringify(micronutrients(food.nutrients)),food.cuisineTags,food.allergenTags,food.dietaryTags,JSON.stringify(sourceMetadata)]);
      for (const portion of food.portions) await client.query(`insert into nutrition_food_portions (id,food_id,portion_label,quantity,quantity_unit,canonical_grams,metadata,status,deleted_at,updated_at) values ($1,$2,$3,1,'portion',$4,$5,'active',null,now()) on conflict (id) do update set portion_label=excluded.portion_label,canonical_grams=excluded.canonical_grams,metadata=excluded.metadata,status='active',deleted_at=null,updated_at=now()`, [portion.id,food.id,portion.label,portion.grams,JSON.stringify(sourceMetadata)]);
    }
    for (const recipe of manifest.recipes) {
      await client.query(`insert into nutrition_recipes (id,recipe_code,catalogue_version,display_name,description,yield_grams,portions,cuisine_tags,dietary_tags,allergen_tags,retention_method,nutrition_totals,source_metadata,verification_status,status,deleted_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'verified','active',null,now()) on conflict (id) do update set display_name=excluded.display_name,description=excluded.description,yield_grams=excluded.yield_grams,portions=excluded.portions,cuisine_tags=excluded.cuisine_tags,dietary_tags=excluded.dietary_tags,allergen_tags=excluded.allergen_tags,retention_method=excluded.retention_method,nutrition_totals=excluded.nutrition_totals,source_metadata=excluded.source_metadata,status='active',deleted_at=null,updated_at=now()`, [recipe.id,recipe.code,manifest.catalogueVersion,recipe.displayName,recipe.description,recipe.yieldGrams,recipe.portions,recipe.cuisineTags,recipe.dietaryTags,recipe.allergenTags,recipe.retentionMethod,JSON.stringify(recipe.nutritionTotals),JSON.stringify({catalogueVersion:manifest.catalogueVersion,method:'Fiteatsy deterministic recipe composition'})]);
      for (const [index, component] of recipe.components.entries()) await client.query(`insert into nutrition_recipe_components (id,recipe_id,food_id,quantity_grams,retention_factors,sort_order,deleted_at,updated_at) values ($1,$2,$3,$4,$5,$6,null,now()) on conflict (id) do update set quantity_grams=excluded.quantity_grams,retention_factors=excluded.retention_factors,sort_order=excluded.sort_order,deleted_at=null,updated_at=now()`, [stableUuid(`${recipe.id}:${component.foodId}`),recipe.id,component.foodId,component.quantityGrams,JSON.stringify(component.retentionFactors ?? {}),index]);
    }
    const recipes = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
    for (const variant of manifest.mealVariants) {
      await client.query(`insert into nutrition_meal_variants (id,owner_scope,meal_key,variant_name,description,household_label,cuisine_tags,dietary_tags,allergen_tags,nutrition_totals,source_metadata,verification_status,status,deleted_at,updated_at) values ($1,'system',$2,$3,$4,$5,$6,$7,$8,$9,$10,'verified','active',null,now()) on conflict (id) do update set meal_key=excluded.meal_key,variant_name=excluded.variant_name,description=excluded.description,household_label=excluded.household_label,cuisine_tags=excluded.cuisine_tags,dietary_tags=excluded.dietary_tags,allergen_tags=excluded.allergen_tags,nutrition_totals=excluded.nutrition_totals,source_metadata=excluded.source_metadata,verification_status='verified',status='active',deleted_at=null,updated_at=now()`, [variant.id,variant.mealKey,variant.name,variant.description,variant.householdLabel,variant.cuisineTags,variant.dietaryTags,variant.allergenTags,JSON.stringify(variant.nutritionTotals),JSON.stringify({catalogueVersion:manifest.catalogueVersion,recipeId:variant.recipeId,portionMultiplier:variant.portionMultiplier})]);
      const recipe = recipes.get(variant.recipeId)!;
      for (const [index, component] of recipe.components.entries()) await client.query(`insert into nutrition_meal_variant_components (id,meal_variant_id,food_id,component_name,quantity,quantity_unit,canonical_grams,locked,nutrition_totals,sort_order,deleted_at,updated_at) values ($1,$2,$3,$4,$5,'g',$5,true,'{}'::jsonb,$6,null,now()) on conflict (id) do update set quantity=excluded.quantity,canonical_grams=excluded.canonical_grams,sort_order=excluded.sort_order,deleted_at=null,updated_at=now()`, [stableUuid(`${variant.id}:${component.foodId}`),variant.id,component.foodId,manifest.foods.find((food)=>food.id===component.foodId)?.displayName ?? 'Ingredient',component.quantityGrams*variant.portionMultiplier,index]);
    }
    await client.query('commit');
    return { catalogueVersion: manifest.catalogueVersion, manifestSha256: sha, counts: { foods: manifest.foods.length, recipes: manifest.recipes.length, mealVariants: manifest.mealVariants.length } };
  } catch (error) { await client.query('rollback'); throw error; } finally { await client.end(); }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) importNutritionCatalogue().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
