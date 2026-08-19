import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { getRegisteredConsultantClientProfileContext } from '../consultants/consultants.repository.js';

export const DIET_TYPES = ['vegetarian', 'eggetarian', 'non_vegetarian', 'vegan', 'jain'] as const;
export const STAPLE_PREFERENCES = ['roti', 'rice', 'both', 'none'] as const;
export const DAIRY_PREFERENCES = ['allowed', 'limited', 'avoid'] as const;

export type FoodPreferenceProfile = {
  dietType: (typeof DIET_TYPES)[number] | null;
  proteins: string[];
  cuisines: string[];
  foodsLiked: string[];
  foodsDisliked: string[];
  foodsAvoided: string[];
  likedFoodIds: string[];
  dislikedFoodIds: string[];
  avoidedFoodIds: string[];
  restrictions: string[];
  staplePreference: (typeof STAPLE_PREFERENCES)[number] | null;
  dairyPreference: (typeof DAIRY_PREFERENCES)[number] | null;
  practicality: string[];
};

const emptyProfile = (): FoodPreferenceProfile => ({
  dietType: null,
  proteins: [],
  cuisines: [],
  foodsLiked: [],
  foodsDisliked: [],
  foodsAvoided: [],
  likedFoodIds: [],
  dislikedFoodIds: [],
  avoidedFoodIds: [],
  restrictions: [],
  staplePreference: null,
  dairyPreference: null,
  practicality: [],
});

const cleanList = (values: string[] | undefined) => Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).slice(0, 100);

export const normalizeFoodPreferenceProfile = (input: Partial<FoodPreferenceProfile>): FoodPreferenceProfile => ({
  dietType: input.dietType && DIET_TYPES.includes(input.dietType) ? input.dietType : null,
  proteins: cleanList(input.proteins),
  cuisines: cleanList(input.cuisines),
  foodsLiked: cleanList(input.foodsLiked),
  foodsDisliked: cleanList(input.foodsDisliked),
  foodsAvoided: cleanList(input.foodsAvoided),
  likedFoodIds: cleanList(input.likedFoodIds),
  dislikedFoodIds: cleanList(input.dislikedFoodIds),
  avoidedFoodIds: cleanList(input.avoidedFoodIds),
  restrictions: cleanList(input.restrictions),
  staplePreference: input.staplePreference && STAPLE_PREFERENCES.includes(input.staplePreference) ? input.staplePreference : null,
  dairyPreference: input.dairyPreference && DAIRY_PREFERENCES.includes(input.dairyPreference) ? input.dairyPreference : null,
  practicality: cleanList(input.practicality),
});

const getContext = async (publicClientId: string) => getRegisteredConsultantClientProfileContext(publicClientId);

export const getFoodPreferenceProfile = async (publicClientId: string) => {
  const context = await getContext(publicClientId);
  if (!context) return null;
  const result = await pool.query(
    `select id, food_preference_profile, food_preference_updated_by, food_preference_updated_at
       from health_profiles where client_id = $1 and deleted_at is null order by updated_at desc limit 1`,
    [context.internalClientId],
  );
  const row = result.rows[0];
  return {
    clientId: publicClientId,
    profile: normalizeFoodPreferenceProfile((row?.food_preference_profile ?? {}) as Partial<FoodPreferenceProfile>),
    updatedBy: row?.food_preference_updated_by ?? null,
    updatedAtISO: row?.food_preference_updated_at ? new Date(row.food_preference_updated_at).toISOString() : null,
  };
};

export const listVerifiedFoodCatalogue = async (query: string, limit = 30, offset = 0) => {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const safeOffset = Math.max(offset, 0);
  const result = await pool.query(
    `select id, canonical_name, display_name, food_category, dietary_classification,
            cuisine_tags, allergen_tags
       from nutrition_foods
      where deleted_at is null and status = 'active' and verification_status = 'verified'
        and ($1 = '' or lower(display_name) like '%' || lower($1) || '%'
          or lower(canonical_name) like '%' || lower($1) || '%'
          or exists (select 1 from jsonb_array_elements_text(aliases) alias where lower(alias) like '%' || lower($1) || '%'))
      order by lower(display_name), id
      limit $2 offset $3`,
    [query.trim(), safeLimit, safeOffset],
  );
  return {
    items: result.rows.map((row) => ({
      id: String(row.id),
      canonicalName: String(row.canonical_name),
      displayName: String(row.display_name),
      category: row.food_category == null ? null : String(row.food_category),
      dietaryClassification: row.dietary_classification == null ? null : String(row.dietary_classification),
      cuisineTags: Array.isArray(row.cuisine_tags) ? row.cuisine_tags.map(String) : [],
      allergenTags: Array.isArray(row.allergen_tags) ? row.allergen_tags.map(String) : [],
    })),
    query: query.trim(),
    limit: safeLimit,
    offset: safeOffset,
    hasMore: result.rowCount === safeLimit,
  };
};

export const updateFoodPreferenceProfile = async (
  publicClientId: string,
  actorUserId: string,
  actorType: 'client' | 'consultant',
  input: Partial<FoodPreferenceProfile>,
) => {
  const context = await getContext(publicClientId);
  if (!context) return null;
  const profile = normalizeFoodPreferenceProfile(input);
  const updatedAt = new Date().toISOString();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const updated = await client.query(
      `update health_profiles
          set food_preference_profile = $1::jsonb,
              food_preference_updated_by = $2,
              food_preference_updated_at = $3,
              updated_at = $3,
              version = version + 1
        where id = (
          select id from health_profiles
           where client_id = $4 and deleted_at is null
           order by updated_at desc limit 1
        )
        returning id`,
      [JSON.stringify(profile), actorUserId, updatedAt, context.internalClientId],
    );
    if (!updated.rowCount) {
      await client.query('rollback');
      return null;
    }
    await client.query(
      `insert into food_preference_audit_events (id, client_id, health_profile_id, actor_user_id, actor_type, profile)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [crypto.randomUUID(), context.internalClientId, updated.rows[0].id, actorUserId, actorType, JSON.stringify(profile)],
    );
    await client.query('commit');
    return { clientId: publicClientId, profile, updatedBy: actorType, updatedAtISO: updatedAt };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};
