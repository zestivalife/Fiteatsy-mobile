import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertDestructiveTestResetAllowed } from '../src/test-support/destructive-reset-guard.js';
import { APPROVED_NUTRITION_CATALOGUE_SHA256, APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_SHA256, APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION, APPROVED_NUTRITION_CATALOGUE_VERSION, NUTRITION_CATALOGUE_TABLE_ALLOWLIST, loadApprovedNutritionCatalogueRelease, } from '../src/modules/nutrition/catalogue/catalogue.import-policy.js';
const { Client } = pg;
const PRODUCTION_IMPORT_CONFIRMATION = `${APPROVED_NUTRITION_CATALOGUE_VERSION}:${APPROVED_NUTRITION_CATALOGUE_SHA256}`;
const macro = (n, key) => n[key] ?? null;
const micronutrients = (n) => Object.fromEntries(Object.entries(n).filter(([key]) => !['calories', 'caloriesKcal', 'proteinGrams', 'carbohydrateGrams', 'fatGrams', 'fibreGrams'].includes(key)));
const stableJson = (value) => value && typeof value === 'object'
    ? Array.isArray(value)
        ? `[${value.map(stableJson).join(',')}]`
        : `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
    : JSON.stringify(value);
const stableUuid = (key) => {
    const hex = createHash('sha256').update(key).digest('hex').slice(0, 32).split('');
    hex[12] = '4';
    hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
    return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};
const countExistingIds = async (client, table, ids) => {
    if (!NUTRITION_CATALOGUE_TABLE_ALLOWLIST.includes(table)) {
        throw new Error(`Catalogue reconciliation denied for non-allowlisted table: ${table}`);
    }
    const result = await client.query(`select id::text as id from ${table} where id = any($1::uuid[])`, [ids]);
    return new Set(result.rows.map((row) => row.id));
};
const reconcileApprovedCatalogue = async (client, manifest, sha256) => {
    const conflicts = [];
    const retained = { foods: [], recipes: [], mealVariants: [] };
    const predecessor = await client.query('select manifest_sha256 from nutrition_catalogue_releases where catalogue_version = $1', [APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION]);
    const hasApprovedPredecessor = predecessor.rows[0]?.manifest_sha256 === APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_SHA256;
    const release = await client.query('select source_name, source_license, manifest_sha256 from nutrition_catalogue_releases where catalogue_version = $1', [manifest.catalogueVersion]);
    if (release.rows[0] && (release.rows[0].source_name !== manifest.source.name || release.rows[0].source_license !== manifest.source.license || release.rows[0].manifest_sha256 !== sha256)) {
        conflicts.push({ entity: 'nutrition_catalogue_releases', id: manifest.catalogueVersion, reason: 'existing release provenance does not match the approved manifest' });
    }
    const foodNames = await client.query('select id::text as id, canonical_name from nutrition_foods where lower(canonical_name) = any($1::text[])', [manifest.foods.map((food) => food.canonicalName.toLowerCase())]);
    const approvedFoodNames = new Map(manifest.foods.map((food) => [food.canonicalName.toLowerCase(), food.id]));
    for (const row of foodNames.rows)
        if (approvedFoodNames.get(row.canonical_name.toLowerCase()) !== row.id)
            conflicts.push({ entity: 'nutrition_foods', id: row.id, reason: 'canonical name belongs to another identity' });
    const recipeCodes = await client.query('select id::text as id, recipe_code, catalogue_version from nutrition_recipes where lower(recipe_code) = any($1::text[])', [manifest.recipes.map((recipe) => recipe.code.toLowerCase())]);
    const approvedRecipeCodes = new Map(manifest.recipes.map((recipe) => [recipe.code.toLowerCase(), recipe.id]));
    for (const row of recipeCodes.rows) {
        const sameIdentity = approvedRecipeCodes.get(row.recipe_code.toLowerCase()) === row.id;
        const retainedPredecessor = sameIdentity && row.catalogue_version === APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION && hasApprovedPredecessor;
        if (!sameIdentity || !(row.catalogue_version === APPROVED_NUTRITION_CATALOGUE_VERSION || retainedPredecessor))
            conflicts.push({ entity: 'nutrition_recipes', id: row.id, reason: 'recipe code or provenance belongs to another identity' });
    }
    const foodIds = manifest.foods.map((food) => food.id);
    const portionIds = manifest.foods.flatMap((food) => food.portions.map((portion) => portion.id));
    const recipeIds = manifest.recipes.map((recipe) => recipe.id);
    const recipeComponentIds = manifest.recipes.flatMap((recipe) => recipe.components.map((component) => stableUuid(`${recipe.id}:${component.foodId}`)));
    const variantIds = manifest.mealVariants.map((variant) => variant.id);
    const recipes = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
    const variantComponentIds = manifest.mealVariants.flatMap((variant) => recipes.get(variant.recipeId).components.map((component) => stableUuid(`${variant.id}:${component.foodId}`)));
    const definitions = [
        ['nutrition_foods', foodIds], ['nutrition_food_portions', portionIds], ['nutrition_recipes', recipeIds],
        ['nutrition_recipe_components', recipeComponentIds], ['nutrition_meal_variants', variantIds],
        ['nutrition_meal_variant_components', variantComponentIds],
    ];
    const counts = {
        nutrition_catalogue_releases: { inserts: release.rowCount ? 0 : 1, updates: release.rowCount ? 1 : 0 },
    };
    for (const [table, ids] of definitions) {
        const existing = await countExistingIds(client, table, ids);
        counts[table] = { inserts: ids.length - existing.size, updates: existing.size };
    }
    const existingFoodRows = await client.query('select id::text as id, source_metadata from nutrition_foods where id = any($1::uuid[])', [foodIds]);
    const approvedFoods = new Map(manifest.foods.map((food) => [food.id, food]));
    for (const row of existingFoodRows.rows) {
        const approved = approvedFoods.get(row.id);
        const sameSource = row.source_metadata?.source === manifest.source.name && Number(row.source_metadata?.fdcId) === approved.fdcId;
        const retainedPredecessor = row.source_metadata?.catalogueVersion === APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION && sameSource && hasApprovedPredecessor;
        if (!(row.source_metadata?.catalogueVersion === manifest.catalogueVersion && sameSource) && !retainedPredecessor) {
            conflicts.push({ entity: 'nutrition_foods', id: row.id, reason: 'existing food provenance does not match the approved manifest' });
        }
        else
            retained.foods.push(row.id);
    }
    const existingRecipeRows = await client.query(`select id::text as id, recipe_code, catalogue_version, display_name, description, yield_grams::text, portions::text,
            cuisine_tags, dietary_tags, allergen_tags, retention_method, nutrition_totals, source_metadata
       from nutrition_recipes where id = any($1::uuid[])`, [recipeIds]);
    const approvedRecipes = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
    for (const row of existingRecipeRows.rows) {
        const approved = approvedRecipes.get(row.id);
        const sameContent = row.display_name === approved.displayName && row.description === approved.description
            && Number(row.yield_grams) === approved.yieldGrams && Number(row.portions) === approved.portions
            && JSON.stringify(row.cuisine_tags) === JSON.stringify(approved.cuisineTags)
            && JSON.stringify(row.dietary_tags) === JSON.stringify(approved.dietaryTags)
            && JSON.stringify(row.allergen_tags) === JSON.stringify(approved.allergenTags)
            && row.retention_method === approved.retentionMethod
            && stableJson(row.nutrition_totals) === stableJson(approved.nutritionTotals);
        const sameProvenance = row.source_metadata?.method === 'Fiteatsy deterministic recipe composition';
        const retainedPredecessor = row.recipe_code === approved.code && row.catalogue_version === APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION && hasApprovedPredecessor;
        if (row.recipe_code !== approved.code || !(row.catalogue_version === manifest.catalogueVersion || retainedPredecessor) || !sameContent || !sameProvenance) {
            conflicts.push({ entity: 'nutrition_recipes', id: row.id, reason: 'existing recipe provenance does not match the approved manifest' });
        }
        else
            retained.recipes.push(row.id);
    }
    const existingPortions = await client.query('select id::text as id, food_id::text as food_id from nutrition_food_portions where id = any($1::uuid[])', [portionIds]);
    const approvedPortions = new Map(manifest.foods.flatMap((food) => food.portions.map((portion) => [portion.id, food.id])));
    for (const row of existingPortions.rows)
        if (approvedPortions.get(row.id) !== row.food_id)
            conflicts.push({ entity: 'nutrition_food_portions', id: row.id, reason: 'existing portion belongs to another food' });
    const existingComponents = await client.query('select id::text as id, recipe_id::text as recipe_id, food_id::text as food_id from nutrition_recipe_components where id = any($1::uuid[])', [recipeComponentIds]);
    const approvedComponents = new Map(manifest.recipes.flatMap((recipe) => recipe.components.map((component) => [stableUuid(`${recipe.id}:${component.foodId}`), `${recipe.id}:${component.foodId}`])));
    for (const row of existingComponents.rows)
        if (approvedComponents.get(row.id) !== `${row.recipe_id}:${row.food_id}`)
            conflicts.push({ entity: 'nutrition_recipe_components', id: row.id, reason: 'existing component belongs to another recipe or food' });
    const existingVariants = await client.query('select id::text as id, owner_scope, source_metadata from nutrition_meal_variants where id = any($1::uuid[])', [variantIds]);
    const approvedVariants = new Map(manifest.mealVariants.map((variant) => [variant.id, variant]));
    for (const row of existingVariants.rows) {
        const approved = approvedVariants.get(row.id);
        const retainedPredecessor = row.owner_scope === 'system' && row.source_metadata?.catalogueVersion === APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION && row.source_metadata?.recipeId === approved.recipeId && hasApprovedPredecessor;
        if (row.owner_scope !== 'system' || !(row.source_metadata?.catalogueVersion === manifest.catalogueVersion || retainedPredecessor) || row.source_metadata?.recipeId !== approved.recipeId)
            conflicts.push({ entity: 'nutrition_meal_variants', id: row.id, reason: 'existing meal variant provenance does not match the approved manifest' });
        else
            retained.mealVariants.push(row.id);
    }
    const existingVariantComponents = await client.query('select id::text as id, meal_variant_id::text as meal_variant_id, food_id::text as food_id from nutrition_meal_variant_components where id = any($1::uuid[])', [variantComponentIds]);
    const approvedVariantComponents = new Map(manifest.mealVariants.flatMap((variant) => recipes.get(variant.recipeId).components.map((component) => [stableUuid(`${variant.id}:${component.foodId}`), `${variant.id}:${component.foodId}`])));
    for (const row of existingVariantComponents.rows)
        if (approvedVariantComponents.get(row.id) !== `${row.meal_variant_id}:${row.food_id}`)
            conflicts.push({ entity: 'nutrition_meal_variant_components', id: row.id, reason: 'existing component belongs to another meal variant or food' });
    return {
        mode: 'dry-run', catalogueVersion: manifest.catalogueVersion, manifestSha256: sha256, writes: 0, invalidRecords: 0,
        executedAt: new Date().toISOString(), runtimeSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
        existing: { foods: existingFoodRows.rowCount ?? 0, recipes: counts.nutrition_recipes.updates, mealVariants: existingVariants.rowCount ?? 0 },
        counts, conflicts, retained,
        classification: {
            retainedUnchanged: retained.foods.length + retained.recipes.length + retained.mealVariants.length,
            newInserts: Object.values(counts).reduce((sum, count) => sum + count.inserts, 0),
            validUpdates: 0,
            trueConflicts: conflicts.length,
            invalid: 0,
        },
    };
};
export const dryRunApprovedNutritionCatalogue = async (databaseUrl = process.env.DATABASE_URL, releaseVersion = APPROVED_NUTRITION_CATALOGUE_VERSION) => {
    if (!databaseUrl)
        throw new Error('DATABASE_URL is required');
    const { manifest, sha256 } = await loadApprovedNutritionCatalogueRelease(releaseVersion);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query('begin transaction read only');
        const reconciliation = await reconcileApprovedCatalogue(client, manifest, sha256);
        await client.query('rollback');
        return reconciliation;
    }
    catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
    }
    finally {
        await client.end();
    }
};
export const importNutritionCatalogue = async (databaseUrl = process.env.DATABASE_URL, options = {}) => {
    if (!databaseUrl)
        throw new Error('DATABASE_URL is required');
    const releaseVersion = options.releaseVersion ?? APPROVED_NUTRITION_CATALOGUE_VERSION;
    if (options.mode === 'production-approved' && releaseVersion !== APPROVED_NUTRITION_CATALOGUE_VERSION)
        throw new Error('Production import is restricted to the approved successor release');
    const { manifest, sha256: sha } = await loadApprovedNutritionCatalogueRelease(releaseVersion);
    const mode = options.mode ?? 'test';
    if (mode === 'test')
        assertDestructiveTestResetAllowed({ ...process.env, DATABASE_URL: databaseUrl });
    else if (options.confirmation !== PRODUCTION_IMPORT_CONFIRMATION)
        throw new Error('Exact production catalogue import confirmation is required');
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query('begin');
        const reconciliation = await reconcileApprovedCatalogue(client, manifest, sha);
        if (reconciliation.conflicts.length)
            throw new Error(`Catalogue import aborted: ${reconciliation.conflicts.length} unsafe reconciliation conflict(s)`);
        const retainedFoodIds = new Set(reconciliation.retained.foods);
        const retainedRecipeIds = new Set(reconciliation.retained.recipes);
        const retainedVariantIds = new Set(reconciliation.retained.mealVariants);
        const existingRelease = await client.query('select manifest_sha256 from nutrition_catalogue_releases where catalogue_version = $1', [manifest.catalogueVersion]);
        if (existingRelease.rows[0] && existingRelease.rows[0].manifest_sha256 !== sha)
            throw new Error('Catalogue import aborted: existing successor release hash does not match the approved manifest');
        if (!existingRelease.rowCount)
            await client.query(`insert into nutrition_catalogue_releases (catalogue_version,source_name,source_license,source_releases,manifest_sha256,record_counts,status,imported_at,updated_at)
      values ($1,$2,$3,$4,$5,$6,'active',now(),now()) on conflict (catalogue_version) do update set source_releases=excluded.source_releases,manifest_sha256=excluded.manifest_sha256,record_counts=excluded.record_counts,status='active',imported_at=now(),updated_at=now()`, [manifest.catalogueVersion, manifest.source.name, manifest.source.license, JSON.stringify(manifest.source.releases), sha, JSON.stringify({ foods: manifest.foods.length, recipes: manifest.recipes.length, mealVariants: manifest.mealVariants.length })]);
        for (const food of manifest.foods) {
            if (retainedFoodIds.has(food.id))
                continue;
            const sourceMetadata = { catalogueVersion: manifest.catalogueVersion, source: manifest.source.name, license: manifest.source.license, fdcId: food.fdcId, dataType: food.dataType, publicationDate: food.publicationDate };
            await client.query(`insert into nutrition_foods (id,canonical_name,display_name,food_category,reference_quantity,reference_unit,calories,protein_grams,carbohydrate_grams,fat_grams,fibre_grams,micronutrients,cuisine_tags,allergen_tags,dietary_tags,source_metadata,verification_status,status,deleted_at,updated_at)
        values ($1,$2,$3,$4,100,'g',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'verified','active',null,now()) on conflict (id) do update set canonical_name=excluded.canonical_name,display_name=excluded.display_name,food_category=excluded.food_category,calories=excluded.calories,protein_grams=excluded.protein_grams,carbohydrate_grams=excluded.carbohydrate_grams,fat_grams=excluded.fat_grams,fibre_grams=excluded.fibre_grams,micronutrients=excluded.micronutrients,cuisine_tags=excluded.cuisine_tags,allergen_tags=excluded.allergen_tags,dietary_tags=excluded.dietary_tags,source_metadata=excluded.source_metadata,verification_status='verified',status='active',deleted_at=null,updated_at=now()`, [food.id, food.canonicalName, food.displayName, food.foodCategory, macro(food.nutrients, 'calories'), macro(food.nutrients, 'proteinGrams'), macro(food.nutrients, 'carbohydrateGrams'), macro(food.nutrients, 'fatGrams'), macro(food.nutrients, 'fibreGrams'), JSON.stringify(micronutrients(food.nutrients)), food.cuisineTags, food.allergenTags, food.dietaryTags, JSON.stringify(sourceMetadata)]);
            for (const portion of food.portions)
                await client.query(`insert into nutrition_food_portions (id,food_id,portion_label,quantity,quantity_unit,canonical_grams,metadata,status,deleted_at,updated_at) values ($1,$2,$3,1,'portion',$4,$5,'active',null,now()) on conflict (id) do update set portion_label=excluded.portion_label,canonical_grams=excluded.canonical_grams,metadata=excluded.metadata,status='active',deleted_at=null,updated_at=now()`, [portion.id, food.id, portion.label, portion.grams, JSON.stringify(sourceMetadata)]);
        }
        for (const recipe of manifest.recipes) {
            if (retainedRecipeIds.has(recipe.id))
                continue;
            await client.query(`insert into nutrition_recipes (id,recipe_code,catalogue_version,display_name,description,yield_grams,portions,cuisine_tags,dietary_tags,allergen_tags,retention_method,nutrition_totals,source_metadata,verification_status,status,deleted_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'verified','active',null,now()) on conflict (id) do update set display_name=excluded.display_name,description=excluded.description,yield_grams=excluded.yield_grams,portions=excluded.portions,cuisine_tags=excluded.cuisine_tags,dietary_tags=excluded.dietary_tags,allergen_tags=excluded.allergen_tags,retention_method=excluded.retention_method,nutrition_totals=excluded.nutrition_totals,source_metadata=excluded.source_metadata,status='active',deleted_at=null,updated_at=now()`, [recipe.id, recipe.code, manifest.catalogueVersion, recipe.displayName, recipe.description, recipe.yieldGrams, recipe.portions, recipe.cuisineTags, recipe.dietaryTags, recipe.allergenTags, recipe.retentionMethod, JSON.stringify(recipe.nutritionTotals), JSON.stringify({ catalogueVersion: manifest.catalogueVersion, method: 'Fiteatsy deterministic recipe composition' })]);
            for (const [index, component] of recipe.components.entries())
                await client.query(`insert into nutrition_recipe_components (id,recipe_id,food_id,quantity_grams,retention_factors,sort_order,deleted_at,updated_at) values ($1,$2,$3,$4,$5,$6,null,now()) on conflict (id) do update set quantity_grams=excluded.quantity_grams,retention_factors=excluded.retention_factors,sort_order=excluded.sort_order,deleted_at=null,updated_at=now()`, [stableUuid(`${recipe.id}:${component.foodId}`), recipe.id, component.foodId, component.quantityGrams, JSON.stringify(component.retentionFactors ?? {}), index]);
        }
        const recipes = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
        for (const variant of manifest.mealVariants) {
            if (retainedVariantIds.has(variant.id))
                continue;
            await client.query(`insert into nutrition_meal_variants (id,owner_scope,meal_key,variant_name,description,household_label,cuisine_tags,dietary_tags,allergen_tags,nutrition_totals,source_metadata,verification_status,status,deleted_at,updated_at) values ($1,'system',$2,$3,$4,$5,$6,$7,$8,$9,$10,'verified','active',null,now()) on conflict (id) do update set meal_key=excluded.meal_key,variant_name=excluded.variant_name,description=excluded.description,household_label=excluded.household_label,cuisine_tags=excluded.cuisine_tags,dietary_tags=excluded.dietary_tags,allergen_tags=excluded.allergen_tags,nutrition_totals=excluded.nutrition_totals,source_metadata=excluded.source_metadata,verification_status='verified',status='active',deleted_at=null,updated_at=now()`, [variant.id, variant.mealKey, variant.name, variant.description, variant.householdLabel, variant.cuisineTags, variant.dietaryTags, variant.allergenTags, JSON.stringify(variant.nutritionTotals), JSON.stringify({ catalogueVersion: manifest.catalogueVersion, recipeId: variant.recipeId, portionMultiplier: variant.portionMultiplier })]);
            const recipe = recipes.get(variant.recipeId);
            for (const [index, component] of recipe.components.entries())
                await client.query(`insert into nutrition_meal_variant_components (id,meal_variant_id,food_id,component_name,quantity,quantity_unit,canonical_grams,locked,nutrition_totals,sort_order,deleted_at,updated_at) values ($1,$2,$3,$4,$5,'g',$5,true,'{}'::jsonb,$6,null,now()) on conflict (id) do update set quantity=excluded.quantity,canonical_grams=excluded.canonical_grams,sort_order=excluded.sort_order,deleted_at=null,updated_at=now()`, [stableUuid(`${variant.id}:${component.foodId}`), variant.id, component.foodId, manifest.foods.find((food) => food.id === component.foodId)?.displayName ?? 'Ingredient', component.quantityGrams * variant.portionMultiplier, index]);
        }
        await options.beforeCommit?.();
        await client.query('commit');
        return {
            catalogueVersion: manifest.catalogueVersion,
            manifestSha256: sha,
            counts: { foods: manifest.foods.length, recipes: manifest.recipes.length, mealVariants: manifest.mealVariants.length },
            writes: reconciliation.classification.newInserts,
            classification: reconciliation.classification,
        };
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        await client.end();
    }
};
const runCli = async () => {
    const action = process.argv[2];
    if (action === '--production-dry-run')
        return dryRunApprovedNutritionCatalogue();
    if (action === '--production-import')
        return importNutritionCatalogue(process.env.DATABASE_URL, { mode: 'production-approved', confirmation: process.env.FITEATSY_NUTRITION_CATALOGUE_IMPORT_APPROVAL });
    if (action === '--test-import')
        return importNutritionCatalogue();
    throw new Error('Explicit action required: --production-dry-run, --production-import, or --test-import');
};
if (process.argv[1] === fileURLToPath(import.meta.url))
    runCli().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
