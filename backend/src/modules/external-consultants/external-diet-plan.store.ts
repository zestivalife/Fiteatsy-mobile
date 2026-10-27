import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import type { NutritionPlanContent } from '../platform/platform.types.js';

export type ExternalDietPlanPublication = {
  userId: string;
  careCaseId: string;
  connectionId: string;
  tenantId: string;
  externalPlanId: string;
  externalVersion: string;
  consultantId: string;
  consultantName: string;
  practiceName: string;
  publishedAtISO: string;
  content: NutritionPlanContent;
};

const summary = (content: NutritionPlanContent) => ({
  calories: content.dailyTargets.calories,
  protein: content.dailyTargets.protein,
  hydration: content.dailyTargets.hydration,
  focusAreas: content.nutritionSnapshot.goals,
});

export const ingestExternalDietPlan = async (input: ExternalDietPlanPublication) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const foodIds = [...new Set(Object.values(input.content.mealPlan).flatMap((section) => section.options.flatMap((option) => option.components?.map((component) => component.foodId).filter((id): id is string => Boolean(id)) ?? [])))];
    const verifiedFoods = await client.query(
      `select id::text from nutrition_foods where id::text = any($1::text[]) and verification_status = 'verified' and status = 'active' and deleted_at is null`,
      [foodIds],
    );
    if (verifiedFoods.rowCount !== foodIds.length) throw new Error('EXTERNAL_DIET_PLAN_UNVERIFIED_FOOD_REFERENCE');
    const existingPlan = await client.query(
      `select * from diet_plans
       where external_source_system = 'ZESTIVA_360' and external_connection_id = $1
         and external_plan_id = $2 and deleted_at is null
       for update`,
      [input.connectionId, input.externalPlanId],
    );
    const now = new Date().toISOString();
    let planId = existingPlan.rows[0]?.id as string | undefined;
    if (!planId) {
      planId = crypto.randomUUID();
      await client.query(
        `insert into diet_plans (
          id, care_case_id, user_id, consultant_id, current_version_id, latest_published_version_id,
          plan_status, readiness_score, template_version, approved_by, approved_at, published_at,
          archived_at, source_snapshot, status, version, created_at, updated_at, deleted_at,
          external_source_system, external_connection_id, external_plan_id
        ) values ($1,$2,$3,null,null,null,'published',null,'external-zestiva-360-v1',null,$4,$4,null,$5::jsonb,'active',1,$6,$6,null,'ZESTIVA_360',$7,$8)`,
        [planId, input.careCaseId, input.userId, input.publishedAtISO, JSON.stringify({
          bmi: null, weightKg: null, biomarkers: [], healthProfile: {}, calorieTarget: input.content.dailyTargets.calories,
          proteinTargetGrams: input.content.dailyTargets.protein, hydrationTargetLiters: input.content.dailyTargets.hydration,
          externalAttribution: { tenantId: input.tenantId, connectionId: input.connectionId, consultantId: input.consultantId, consultantName: input.consultantName, practiceName: input.practiceName },
          generatedAtISO: input.publishedAtISO,
        }), now, input.connectionId, input.externalPlanId],
      );
    }
    const existingVersion = await client.query(
      `select id, version_number from diet_plan_versions
       where diet_plan_id = $1 and external_source_version = $2 and deleted_at is null`,
      [planId, input.externalVersion],
    );
    let versionId = existingVersion.rows[0]?.id as string | undefined;
    let versionNumber = Number(existingVersion.rows[0]?.version_number ?? 0);
    if (!versionId) {
      const next = await client.query(
        `select coalesce(max(version_number), 0) + 1 as next_version from diet_plan_versions where diet_plan_id = $1`,
        [planId],
      );
      versionNumber = Number(next.rows[0].next_version);
      versionId = crypto.randomUUID();
      await client.query(
        `insert into diet_plan_versions (
          id,diet_plan_id,version_number,generated_by,content,source_snapshot,content_summary,
          lifecycle_status,review_notes,exported_doc_path,exported_pdf_path,status,created_at,updated_at,deleted_at,
          external_source_version
        ) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,'published',null,null,null,'active',$8,$8,null,$9)`,
        [versionId, planId, versionNumber, input.userId, JSON.stringify(input.content), JSON.stringify({
          externalAttribution: { tenantId: input.tenantId, connectionId: input.connectionId, consultantId: input.consultantId }, generatedAtISO: input.publishedAtISO,
        }), JSON.stringify(summary(input.content)), now, input.externalVersion],
      );
      await client.query(
        `update diet_plans set current_version_id=$2, latest_published_version_id=$2, published_at=$3,
          updated_at=$4, version=version+1 where id=$1`,
        [planId, versionId, input.publishedAtISO, now],
      );
    }
    await client.query('commit');
    return { planId, versionId, versionNumber, created: existingVersion.rowCount === 0 };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const selectExternalDietPlan = async (input: { userId: string; careCaseId: string; connectionId: string; externalPlanId: string }) => {
  const result = await pool.query(
    `insert into client_active_diet_plan_selections
      (id,care_case_id,user_id,diet_plan_id,diet_plan_version_id,selected_by,source,version,created_at,updated_at)
     select $1,$2,$3,dp.id,dp.latest_published_version_id,$3,'CLIENT',1,now(),now()
     from diet_plans dp
     where dp.care_case_id=$2 and dp.user_id=$3 and dp.external_source_system='ZESTIVA_360'
       and dp.external_connection_id=$4 and dp.external_plan_id=$5 and dp.deleted_at is null
       and dp.latest_published_version_id is not null
     on conflict (care_case_id,user_id) do update set
       diet_plan_id=excluded.diet_plan_id,diet_plan_version_id=excluded.diet_plan_version_id,
       selected_by=excluded.selected_by,source=excluded.source,version=client_active_diet_plan_selections.version+1,updated_at=now()
     returning diet_plan_id,diet_plan_version_id,version`,
    [crypto.randomUUID(), input.careCaseId, input.userId, input.connectionId, input.externalPlanId],
  );
  return result.rows[0] ?? null;
};
