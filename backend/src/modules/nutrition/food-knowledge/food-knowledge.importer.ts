import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { getPool } from '../../../db/pool.js';
import type { FoodKnowledgeImportResult, FoodKnowledgeManifest } from './food-knowledge.types.js';
import { sha256, validateFoodKnowledgeManifest } from './food-knowledge.validation.js';

const countsFor = (manifest: FoodKnowledgeManifest) => ({
  foods: manifest.foods.length,
  versions: manifest.foods.length,
  servings: manifest.foods.reduce((sum, food) => sum + food.version.servings.length, 0),
  nutrients: manifest.foods.reduce((sum, food) => sum + Object.values(food.version.nutrients).filter((value) => value != null).length, 0),
  families: manifest.families.length,
});

const inspectConflicts = async (client: PoolClient, manifest: FoodKnowledgeManifest, manifestSha256: string) => {
  const conflicts: string[] = [];
  const release = await client.query<{ manifest_sha256: string }>('select manifest_sha256 from food_knowledge_releases where release_version = $1', [manifest.releaseVersion]);
  if (release.rowCount && release.rows[0]?.manifest_sha256 !== manifestSha256) conflicts.push(`RELEASE_HASH_COLLISION:${manifest.releaseVersion}`);

  for (const source of manifest.sources) {
    const row = await client.query<{ id: string; source_name: string; source_version: string; licence_code: string; licence_status: string }>(
      'select id, source_name, source_version, licence_code, licence_status from food_knowledge_sources where source_code = $1 or id = $2', [source.code, source.id]);
    const existing = row.rows[0];
    if (existing && (existing.id !== source.id || existing.source_name !== source.name || existing.source_version !== source.version || existing.licence_code !== source.licenceCode || existing.licence_status !== source.licenceStatus)) conflicts.push(`PROVENANCE_DRIFT:${source.code}`);
  }
  for (const food of manifest.foods) {
    const row = await client.query<{ food_id: string; canonical_code: string }>('select food_id, canonical_code from food_knowledge_food_profiles where food_id = $1 or canonical_code = $2', [food.id, food.canonicalCode]);
    const existing = row.rows[0];
    if (existing && (existing.food_id !== food.id || existing.canonical_code !== food.canonicalCode)) conflicts.push(`CANONICAL_IDENTITY_COLLISION:${food.canonicalCode}`);
    const version = await client.query<{ food_id: string; version_number: number; content_sha256: string }>('select food_id, version_number, content_sha256 from food_knowledge_versions where id = $1 or (food_id = $2 and version_number = $3)', [food.version.id, food.id, food.version.number]);
    const current = version.rows[0];
    const contentHash = sha256(food.version);
    if (current && (current.food_id !== food.id || Number(current.version_number) !== food.version.number || current.content_sha256 !== contentHash)) conflicts.push(`FOOD_VERSION_CONTENT_DRIFT:${food.canonicalCode}:v${food.version.number}`);
  }
  return conflicts;
};

export const dryRunFoodKnowledgeRelease = async (
  manifest: FoodKnowledgeManifest,
  database: Pool = getPool(),
): Promise<FoodKnowledgeImportResult> => {
  const manifestSha256 = sha256(manifest);
  const validation = validateFoodKnowledgeManifest(manifest);
  const client = await database.connect();
  try {
    const conflicts = await inspectConflicts(client, manifest, manifestSha256);
    return {
      releaseVersion: manifest.releaseVersion,
      manifestSha256,
      writes: 0,
      conflicts,
      invalidRecords: validation.issues.map((issue) => `${issue.code}:${issue.path}`),
      counts: countsFor(manifest),
    };
  } finally {
    client.release();
  }
};

const insert = async (client: PoolClient, sql: string, values: unknown[]) => Number((await client.query(sql, values)).rowCount ?? 0);

export const importFoodKnowledgeRelease = async (
  manifest: FoodKnowledgeManifest,
  database: Pool = getPool(),
): Promise<FoodKnowledgeImportResult> => {
  const dryRun = await dryRunFoodKnowledgeRelease(manifest, database);
  if (dryRun.invalidRecords.length || dryRun.conflicts.length) {
    throw new Error(`FOOD_KNOWLEDGE_IMPORT_BLOCKED:${[...dryRun.invalidRecords, ...dryRun.conflicts].join(',')}`);
  }
  const client = await database.connect();
  let writes = 0;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1, $2)', [20260903, 42]);
    const conflicts = await inspectConflicts(client, manifest, dryRun.manifestSha256);
    if (conflicts.length) throw new Error(`FOOD_KNOWLEDGE_IMPORT_BLOCKED:${conflicts.join(',')}`);
    const existing = await client.query('select 1 from food_knowledge_releases where release_version = $1', [manifest.releaseVersion]);
    if (existing.rowCount) {
      await client.query('rollback');
      return { ...dryRun, writes: 0 };
    }

    writes += await insert(client, `insert into food_knowledge_releases (release_version, predecessor_version, manifest_sha256, status, record_counts)
      values ($1,$2,$3,'candidate',$4::jsonb)`, [manifest.releaseVersion, manifest.predecessorVersion, dryRun.manifestSha256, JSON.stringify(dryRun.counts)]);

    for (const source of manifest.sources) writes += await insert(client, `insert into food_knowledge_sources
      (id, source_code, source_name, source_version, source_url, licence_code, licence_status, attribution_text)
      values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`, [source.id, source.code, source.name, source.version, source.url, source.licenceCode, source.licenceStatus, source.attributionText]);
    for (const family of manifest.families.filter((item) => item.parentId == null)) writes += await insert(client, `insert into food_knowledge_families (id,family_code,display_name,parent_id,family_kind) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`, [family.id, family.code, family.name, family.parentId, family.kind]);
    for (const family of manifest.families.filter((item) => item.parentId != null)) writes += await insert(client, `insert into food_knowledge_families (id,family_code,display_name,parent_id,family_kind) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`, [family.id, family.code, family.name, family.parentId, family.kind]);
    for (const cuisine of manifest.cuisines.filter((item) => item.parentId == null)) writes += await insert(client, `insert into food_knowledge_cuisines (id,cuisine_code,display_name,parent_id) values ($1,$2,$3,$4) on conflict (id) do nothing`, [cuisine.id, cuisine.code, cuisine.name, cuisine.parentId]);
    for (const cuisine of manifest.cuisines.filter((item) => item.parentId != null)) writes += await insert(client, `insert into food_knowledge_cuisines (id,cuisine_code,display_name,parent_id) values ($1,$2,$3,$4) on conflict (id) do nothing`, [cuisine.id, cuisine.code, cuisine.name, cuisine.parentId]);
    for (const nutrient of manifest.nutrients) writes += await insert(client, `insert into food_knowledge_nutrients (id,nutrient_code,display_name,canonical_unit,category,display_order) values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`, [nutrient.id, nutrient.code, nutrient.name, nutrient.unit, nutrient.category, nutrient.displayOrder]);
    for (const allergen of manifest.allergens) writes += await insert(client, `insert into food_knowledge_allergens (id,allergen_code,display_name) values ($1,$2,$3) on conflict (id) do nothing`, [allergen.id, allergen.code, allergen.name]);
    for (const tag of manifest.contextTags.filter((item) => item.parentId == null)) writes += await insert(client, `insert into food_knowledge_context_tags (id,context_code,display_name,category,parent_id) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`, [tag.id, tag.code, tag.name, tag.category, tag.parentId]);
    for (const tag of manifest.contextTags.filter((item) => item.parentId != null)) writes += await insert(client, `insert into food_knowledge_context_tags (id,context_code,display_name,category,parent_id) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`, [tag.id, tag.code, tag.name, tag.category, tag.parentId]);

    for (const food of manifest.foods) {
      writes += await insert(client, `insert into nutrition_foods (id,canonical_name,display_name,aliases,food_category,food_group,dietary_classification,preparation_state,reference_quantity,reference_unit,cuisine_tags,allergen_tags,dietary_tags,source_metadata,verification_status,status)
        values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,100,'g','{}','{}','{}',$9::jsonb,'verified','active') on conflict (id) do nothing`, [food.id, food.canonicalName, food.displayName, JSON.stringify(food.aliases), food.foodType, food.familyId, null, null, JSON.stringify({ source: 'Food Knowledge fixture', releaseVersion: manifest.releaseVersion })]);
      writes += await insert(client, `insert into food_knowledge_food_profiles (food_id,canonical_code,family_id,food_type,client_consumable) values ($1,$2,$3,$4,$5) on conflict (food_id) do nothing`, [food.id, food.canonicalCode, food.familyId, food.foodType, food.clientConsumable]);
      const versionHash = sha256(food.version);
      writes += await insert(client, `insert into food_knowledge_versions (id,food_id,version_number,release_version,content_sha256,verification_status,nutrition_status,production_eligible) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`, [food.version.id, food.id, food.version.number, manifest.releaseVersion, versionHash, food.version.verificationStatus, food.version.nutritionStatus, food.version.productionEligible]);
      writes += await insert(client, `insert into food_knowledge_release_memberships (release_version,food_version_id) values ($1,$2) on conflict do nothing`, [manifest.releaseVersion, food.version.id]);
      writes += await insert(client, `insert into food_knowledge_version_sources (id,food_version_id,source_id,source_record_id,selected_for_canonical) values ($1,$2,$3,$4,true) on conflict do nothing`, [crypto.randomUUID(), food.version.id, food.version.sourceId, food.version.sourceRecordId]);
      for (const alias of food.aliases) writes += await insert(client, `insert into food_knowledge_aliases (id,food_id,alias) values ($1,$2,$3) on conflict do nothing`, [crypto.randomUUID(), food.id, alias]);
      for (const serving of food.version.servings) writes += await insert(client, `insert into food_knowledge_servings (id,food_version_id,serving_code,serving_name,grams,is_canonical,is_client_friendly,minimum_quantity,maximum_quantity,increment_quantity) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`, [serving.id, food.version.id, serving.code, serving.name, serving.grams, serving.canonical, serving.clientFriendly, serving.minimum, serving.maximum, serving.increment]);
      for (const component of food.version.components) writes += await insert(client, `insert into food_knowledge_components (id,food_version_id,component_food_id,component_role,quantity_grams,sort_order) values ($1,$2,$3,$4,$5,$6) on conflict do nothing`, [component.id, food.version.id, component.foodId, component.role, component.grams, food.version.components.indexOf(component)]);
      for (const compatibility of food.version.compatibilities) writes += await insert(client, `insert into food_knowledge_compatibilities (id,food_version_id,dimension,compatibility_code,compatibility_status,rationale) values ($1,$2,$3,$4,$5,$6) on conflict do nothing`, [compatibility.id, food.version.id, compatibility.dimension, compatibility.code, compatibility.status, compatibility.rationale]);
      for (const meal of food.version.mealSuitability) writes += await insert(client, `insert into food_knowledge_meal_suitability (food_version_id,meal_key,suitability) values ($1,$2,$3) on conflict do nothing`, [food.version.id, meal.mealKey, meal.suitability]);
      for (const code of food.version.cuisines) writes += await insert(client, `insert into food_knowledge_version_cuisines (food_version_id,cuisine_id) select $1,id from food_knowledge_cuisines where cuisine_code=$2 on conflict do nothing`, [food.version.id, code]);
      for (const mapping of food.version.allergens) writes += await insert(client, `insert into food_knowledge_version_allergens (food_version_id,allergen_id,presence_status,source_id) select $1,id,$3,$4 from food_knowledge_allergens where allergen_code=$2 on conflict do nothing`, [food.version.id, mapping.allergenCode, mapping.status, food.version.sourceId]);
      for (const code of food.version.contextTags) writes += await insert(client, `insert into food_knowledge_version_context_tags (food_version_id,context_tag_id) select $1,id from food_knowledge_context_tags where context_code=$2 on conflict do nothing`, [food.version.id, code]);
      for (const [code, amount] of Object.entries(food.version.nutrients)) {
        if (amount == null) continue;
        writes += await insert(client, `insert into food_knowledge_food_nutrients (id,food_version_id,nutrient_id,amount,basis,source_id,verification_status) select $1,$2,id,$4,'PER_100_G',$5,'verified' from food_knowledge_nutrients where nutrient_code=$3 on conflict do nothing`, [crypto.randomUUID(), food.version.id, code, amount, food.version.sourceId]);
      }
    }
    await client.query(`update food_knowledge_releases set imported_at=now(), status='validated' where release_version=$1`, [manifest.releaseVersion]);
    await client.query('commit');
    return { ...dryRun, writes };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};
