import { pool } from '../../../db/pool.js';
import type { FoodKnowledgeQuery } from './food-knowledge.types.js';

const safeLimit = (value: number | undefined) => Math.min(Math.max(Math.trunc(value ?? 50), 1), 100);

export const getFoodKnowledgeProjection = async (foodId: string) => {
  const result = await pool.query('select * from food_knowledge_generation_projection where food_id = $1 order by version_number desc limit 1', [foodId]);
  return result.rows[0] ?? null;
};

export const searchFoodKnowledge = async (query: string, limit = 30) => {
  const result = await pool.query(
    `select distinct p.food_id, p.canonical_code, f.display_name, p.food_type, p.client_consumable
       from food_knowledge_food_profiles p
       join nutrition_foods f on f.id = p.food_id
       left join food_knowledge_aliases a on a.food_id = p.food_id
      where p.lifecycle_status = 'active' and f.deleted_at is null
        and ($1 = '' or lower(f.display_name) like '%' || lower($1) || '%' or lower(p.canonical_code) like '%' || lower($1) || '%' or lower(a.alias) like '%' || lower($1) || '%')
      order by f.display_name, p.food_id
      limit $2`,
    [query.trim().slice(0, 100), safeLimit(limit)],
  );
  return result.rows;
};

export const findEligibleFoodKnowledge = async (input: FoodKnowledgeQuery) => {
  const result = await pool.query(
    `with recursive requested_cuisines as (
       select id from food_knowledge_cuisines where cuisine_code = any($6::text[])
       union all
       select child.id from food_knowledge_cuisines child join requested_cuisines parent on child.parent_id = parent.id
     )
     select distinct p.*
       from food_knowledge_generation_projection p
      where p.production_eligible = true and p.client_consumable = true and p.food_type <> 'INGREDIENT_ONLY'
        and ($1::text is null or exists (select 1 from jsonb_array_elements(p.meal_suitability) item where item->>'mealKey'=$1 and item->>'suitability' <> 'UNSUITABLE'))
        and ($2::text is null or exists (select 1 from jsonb_array_elements(p.compatibilities) item where item->>'dimension'='DIET_PATTERN' and item->>'code'=$2 and item->>'status'='COMPATIBLE'))
        and not exists (select 1 from unnest($3::text[]) requested(code) where not exists (select 1 from jsonb_array_elements(p.compatibilities) item where item->>'dimension'='PREPARATION_PROFILE' and item->>'code'=requested.code and item->>'status'='COMPATIBLE'))
        and not exists (select 1 from jsonb_array_elements(p.components) component where component->>'foodId'=any($4::text[]))
        and not exists (select 1 from unnest($5::text[]) requested(code) where not exists (select 1 from jsonb_array_elements(p.allergens) allergen where allergen->>'code'=requested.code and allergen->>'status'='ABSENT_VERIFIED'))
        and (cardinality($6::text[])=0 or exists (select 1 from food_knowledge_version_cuisines vc where vc.food_version_id=p.food_version_id and vc.cuisine_id in (select id from requested_cuisines)))
        and (cardinality($7::text[])=0 or exists (select 1 from jsonb_array_elements(p.context_tags) tag where tag->>'code'=any($7::text[])))
      order by p.display_name, p.food_id
      limit $8`,
    [input.mealKey ?? null, input.dietPattern ?? null, input.preparationProfiles ?? [], input.excludeComponentFoodIds ?? [], input.excludeAllergenCodes ?? [], input.cuisineCodes ?? [], input.contextCodes ?? [], safeLimit(input.limit)],
  );
  return result.rows;
};

export const flattenFoodKnowledgeComposition = async (foodVersionId: string, maximumDepth = 5) => {
  const result = await pool.query(
    `with recursive composition as (
       select c.component_food_id, c.component_role, 1 as depth, array[v.food_id, c.component_food_id]::uuid[] as path
         from food_knowledge_components c join food_knowledge_versions v on v.id=c.food_version_id
        where c.food_version_id=$1
       union all
       select child.component_food_id, child.component_role, parent.depth+1, parent.path || child.component_food_id
         from composition parent
         join food_knowledge_versions child_version on child_version.food_id=parent.component_food_id and child_version.retired_at is null
         join food_knowledge_components child on child.food_version_id=child_version.id
        where parent.depth < $2 and not child.component_food_id = any(parent.path)
     ) select distinct component_food_id, component_role, min(depth)::int as depth from composition group by component_food_id, component_role order by depth, component_food_id`,
    [foodVersionId, Math.min(Math.max(maximumDepth, 1), 10)],
  );
  return result.rows;
};

export const getFoodKnowledgeCoverage = async (releaseVersion: string) => {
  const result = await pool.query(
    `select
       count(distinct p.food_id)::int as food_count,
       count(distinct p.family_id)::int as family_count,
       count(distinct p.food_id) filter (where p.food_type <> 'INGREDIENT_ONLY')::int as preparation_count,
       count(distinct s.id)::int as serving_count,
       count(distinct p.food_version_id)::int as food_version_count,
       count(distinct p.food_id) filter (where p.production_eligible and p.client_consumable and p.food_type <> 'INGREDIENT_ONLY')::int as diet_eligible_food_count,
       count(distinct p.food_id) filter (where p.food_type='INGREDIENT_ONLY')::int as ingredient_only_count,
       count(distinct vc.cuisine_id)::int as cuisine_count,
       count(distinct ms.meal_key)::int as meal_head_count,
       count(distinct c.compatibility_code) filter (where c.dimension='DIET_PATTERN' and c.compatibility_status='COMPATIBLE')::int as diet_pattern_count,
       count(distinct c.compatibility_code) filter (where c.dimension='PREPARATION_PROFILE' and c.compatibility_status='COMPATIBLE')::int as preparation_profile_count
     from food_knowledge_generation_projection p
     left join food_knowledge_servings s on s.food_version_id=p.food_version_id
     left join food_knowledge_version_cuisines vc on vc.food_version_id=p.food_version_id
     left join food_knowledge_meal_suitability ms on ms.food_version_id=p.food_version_id
     left join food_knowledge_compatibilities c on c.food_version_id=p.food_version_id
     where p.release_version=$1`,
    [releaseVersion],
  );
  return result.rows[0];
};
