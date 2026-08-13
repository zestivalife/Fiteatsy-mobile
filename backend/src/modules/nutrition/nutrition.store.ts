import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import type {
  ClientOwnershipContext,
  DietPlanRecord,
  DietPlanVersionRecord,
  NutritionPlanContent,
  NutritionPlanLifecycle,
  NutritionPlanSourceSnapshot,
} from '../platform/platform.types.js';

const nowIso = () => new Date().toISOString();

const toIso = (value: unknown) => {
  if (value == null) return null;
  return new Date(String(value)).toISOString();
};

const toNumberOrNull = (value: unknown) => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRecord = <T extends Record<string, unknown>>(value: unknown, fallback: T): T => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value as T;
};

const mapAuditFields = (row: Record<string, unknown>) => ({
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  updatedAtISO: new Date(String(row.updated_at)).toISOString(),
  deletedAtISO: toIso(row.deleted_at),
  version: Number(row.version),
  status: String(row.status) as DietPlanRecord['status'],
});

const mapDietPlan = (row: Record<string, unknown>): DietPlanRecord => ({
  id: String(row.id),
  careCaseId: String(row.care_case_id),
  userId: String(row.user_id),
  consultantId: row.consultant_id == null ? null : String(row.consultant_id),
  currentVersionId: row.current_version_id == null ? null : String(row.current_version_id),
  latestPublishedVersionId: row.latest_published_version_id == null ? null : String(row.latest_published_version_id),
  planStatus: String(row.plan_status) as NutritionPlanLifecycle,
  readinessScore: toNumberOrNull(row.readiness_score),
  templateVersion: String(row.template_version),
  approvedBy: row.approved_by == null ? null : String(row.approved_by),
  approvedAtISO: toIso(row.approved_at),
  publishedAtISO: toIso(row.published_at),
  archivedAtISO: toIso(row.archived_at),
  sourceSnapshot: toRecord<NutritionPlanSourceSnapshot>(row.source_snapshot, {
    bmi: null,
    weightKg: null,
    biomarkers: [],
    healthProfile: {},
    calorieTarget: null,
    proteinTargetGrams: null,
    hydrationTargetLiters: null,
    wellnessScores: {
      nourishment: null,
      energyBalance: null,
      bodySupport: null,
      recovery: null,
      activePerformance: null,
      physicalWellnessIndex: null,
      stressResilience: null,
    },
    stressAssessment: null,
    generatedAtISO: nowIso(),
  }),
  ...mapAuditFields(row),
});

const mapDietPlanVersion = (row: Record<string, unknown>): DietPlanVersionRecord => ({
  id: String(row.id),
  dietPlanId: String(row.diet_plan_id),
  versionNumber: Number(row.version_number),
  generatedBy: String(row.generated_by),
  content: toRecord<NutritionPlanContent>(row.content, {
    nutritionSnapshot: {
      client: 'Client',
      age: null,
      gender: null,
      goals: [],
      healthConditions: [],
      dietPreference: null,
      allergies: [],
      lifestyleSummary: '',
      personalisedPlanFocus: '',
      programmeName: '',
      preparedBy: '',
    },
    dailyTargets: {
      calories: null,
      protein: null,
      hydration: null,
      movement: '',
    },
    mealPlan: {
      earlyMorning: { window: '', focus: '', options: [] },
      breakfast: { window: '', focus: '', options: [] },
      midMorningSnack: { window: '', focus: '', options: [] },
      lunch: { window: '', focus: '', options: [] },
      eveningSnack: { window: '', focus: '', options: [] },
      dinner: { window: '', focus: '', options: [] },
      bedtimeNutrition: { window: '', focus: '', options: [] },
    },
    hydrationRhythm: [],
    weeklySuccessGuide: [],
    smartSubstitutions: [],
    supplementsAndClinicalNotes: [],
  }),
  sourceSnapshot: toRecord<NutritionPlanSourceSnapshot>(row.source_snapshot, {
    bmi: null,
    weightKg: null,
    biomarkers: [],
    healthProfile: {},
    calorieTarget: null,
    proteinTargetGrams: null,
    hydrationTargetLiters: null,
    wellnessScores: {
      nourishment: null,
      energyBalance: null,
      bodySupport: null,
      recovery: null,
      activePerformance: null,
      physicalWellnessIndex: null,
      stressResilience: null,
    },
    stressAssessment: null,
    generatedAtISO: nowIso(),
  }),
  contentSummary: toRecord(row.content_summary, {
    calories: null,
    protein: null,
    hydration: null,
    focusAreas: [],
  }) as DietPlanVersionRecord['contentSummary'],
  lifecycleStatus: String(row.lifecycle_status) as NutritionPlanLifecycle,
  reviewNotes: row.review_notes == null ? null : String(row.review_notes),
  exportedDocPath: row.exported_doc_path == null ? null : String(row.exported_doc_path),
  exportedPdfPath: row.exported_pdf_path == null ? null : String(row.exported_pdf_path),
  ...mapAuditFields(row),
});

export const getDietPlanByCareCaseId = async (careCaseId: string) => {
  const result = await pool.query(
    `
      select *
      from diet_plans
      where care_case_id = $1
        and deleted_at is null
        and status = 'active'
      order by updated_at desc
      limit 1
    `,
    [careCaseId],
  );
  if (result.rowCount === 0) return null;
  return mapDietPlan(result.rows[0]);
};

export const getDietPlanById = async (dietPlanId: string) => {
  const result = await pool.query(
    `
      select *
      from diet_plans
      where id = $1
        and deleted_at is null
      limit 1
    `,
    [dietPlanId],
  );
  if (result.rowCount === 0) return null;
  return mapDietPlan(result.rows[0]);
};

export const getDietPlanVersionById = async (versionId: string) => {
  const result = await pool.query(
    `
      select *
      from diet_plan_versions
      where id = $1
        and deleted_at is null
      limit 1
    `,
    [versionId],
  );
  if (result.rowCount === 0) return null;
  return mapDietPlanVersion(result.rows[0]);
};

export const getCurrentDietPlanVersion = async (dietPlanId: string) => {
  const result = await pool.query(
    `
      select dpv.*
      from diet_plans dp
      join diet_plan_versions dpv on dpv.id = dp.current_version_id
      where dp.id = $1
        and dp.deleted_at is null
        and dpv.deleted_at is null
      limit 1
    `,
    [dietPlanId],
  );
  if (result.rowCount === 0) return null;
  return mapDietPlanVersion(result.rows[0]);
};

export const getLatestPublishedDietPlanByClientId = async (owner: ClientOwnershipContext) => {
  const result = await pool.query(
    `
      select dp.*, dpv.*
      from care_cases cc
      join diet_plans dp on dp.care_case_id = cc.id
      join diet_plan_versions dpv on dpv.id = dp.latest_published_version_id
      where cc.client_id = $1
        and cc.user_id = $2
        and cc.deleted_at is null
        and dp.deleted_at is null
        and dp.status = 'active'
        and dp.plan_status = 'published'
        and dpv.deleted_at is null
        and dpv.status = 'active'
      order by dp.published_at desc nulls last, dp.updated_at desc
      limit 1
    `,
    [owner.clientId, owner.accountId],
  );
  if (result.rowCount === 0) return null;
  return {
    plan: mapDietPlan(result.rows[0]),
    version: mapDietPlanVersion(result.rows[0]),
  };
};

export const createOrUpdateDietPlanDraft = async (input: {
  careCaseId: string;
  userId: string;
  consultantId: string;
  readinessScore: number | null;
  templateVersion: string;
  sourceSnapshot: NutritionPlanSourceSnapshot;
  content: NutritionPlanContent;
  contentSummary: DietPlanVersionRecord['contentSummary'];
  generatedBy: string;
}) => {
  const existingPlan = await getDietPlanByCareCaseId(input.careCaseId);
  const timestamp = nowIso();

  let plan = existingPlan;
  if (!plan) {
    const insertedPlan = await pool.query(
      `
        insert into diet_plans (
          id, care_case_id, user_id, consultant_id, current_version_id, latest_published_version_id,
          plan_status, readiness_score, template_version, approved_by, approved_at, published_at, archived_at,
          source_snapshot, status, version, created_at, updated_at, deleted_at
        ) values (
          $1, $2, $3, $4, null, null,
          'draft', $5, $6, null, null, null, null,
          $7::jsonb, 'active', 1, $8, $8, null
        )
        returning *
      `,
      [
        crypto.randomUUID(),
        input.careCaseId,
        input.userId,
        input.consultantId,
        input.readinessScore,
        input.templateVersion,
        JSON.stringify(input.sourceSnapshot),
        timestamp,
      ],
    );
    plan = mapDietPlan(insertedPlan.rows[0]);
  }

  const currentVersion = plan.currentVersionId ? await getDietPlanVersionById(plan.currentVersionId) : null;
  const nextVersionNumber = currentVersion ? currentVersion.versionNumber + 1 : 1;

  const insertedVersion = await pool.query(
    `
      insert into diet_plan_versions (
        id, diet_plan_id, version_number, generated_by, content, source_snapshot, content_summary,
        lifecycle_status, review_notes, exported_doc_path, exported_pdf_path, status, created_at, updated_at, deleted_at
      ) values (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
        'draft', null, null, null, 'active', $8, $8, null
      )
      returning *
    `,
    [
      crypto.randomUUID(),
      plan.id,
      nextVersionNumber,
      input.generatedBy,
      JSON.stringify(input.content),
      JSON.stringify(input.sourceSnapshot),
      JSON.stringify(input.contentSummary),
      timestamp,
    ],
  );

  const updatedPlan = await pool.query(
    `
      update diet_plans
      set
        consultant_id = $2,
        current_version_id = $3,
        plan_status = 'draft',
        readiness_score = $4,
        template_version = $5,
        approved_by = null,
        approved_at = null,
        source_snapshot = $6::jsonb,
        updated_at = $7,
        version = version + 1
      where id = $1
      returning *
    `,
    [
      plan.id,
      input.consultantId,
      insertedVersion.rows[0].id,
      input.readinessScore,
      input.templateVersion,
      JSON.stringify(input.sourceSnapshot),
      timestamp,
    ],
  );

  return {
    plan: mapDietPlan(updatedPlan.rows[0]),
    version: mapDietPlanVersion(insertedVersion.rows[0]),
  };
};

export const updateDietPlanVersionContent = async (input: {
  dietPlanId: string;
  versionId: string;
  content: NutritionPlanContent;
  contentSummary: DietPlanVersionRecord['contentSummary'];
  sourceSnapshot: NutritionPlanSourceSnapshot;
  lifecycleStatus?: NutritionPlanLifecycle;
  reviewNotes?: string | null;
}) => {
  const timestamp = nowIso();
  const updatedVersion = await pool.query(
    `
      update diet_plan_versions
      set
        content = $3::jsonb,
        content_summary = $4::jsonb,
        source_snapshot = $5::jsonb,
        lifecycle_status = coalesce($6, lifecycle_status),
        review_notes = $7,
        updated_at = $8,
        version = version + 1
      where id = $1
        and diet_plan_id = $2
        and deleted_at is null
      returning *
    `,
    [
      input.versionId,
      input.dietPlanId,
      JSON.stringify(input.content),
      JSON.stringify(input.contentSummary),
      JSON.stringify(input.sourceSnapshot),
      input.lifecycleStatus ?? null,
      input.reviewNotes ?? null,
      timestamp,
    ],
  );
  if (updatedVersion.rowCount === 0) return null;
  return mapDietPlanVersion(updatedVersion.rows[0]);
};

export const updateDietPlanLifecycle = async (input: {
  dietPlanId: string;
  consultantId: string;
  lifecycle: NutritionPlanLifecycle;
  currentVersionId: string;
  approvedBy?: string | null;
  sourceSnapshot: NutritionPlanSourceSnapshot;
}) => {
  const timestamp = nowIso();
  const updatedPlan = await pool.query(
    `
      update diet_plans
      set
        consultant_id = $2,
        current_version_id = $3,
        latest_published_version_id = case when $4 = 'published' then $3 else latest_published_version_id end,
        plan_status = $4,
        approved_by = case when $4 in ('approved', 'published') then $5 else approved_by end,
        approved_at = case when $4 in ('approved', 'published') then coalesce(approved_at, $6) else approved_at end,
        published_at = case when $4 = 'published' then $6 else published_at end,
        archived_at = case when $4 = 'archived' then $6 else archived_at end,
        source_snapshot = $7::jsonb,
        updated_at = $6,
        version = version + 1
      where id = $1
        and deleted_at is null
      returning *
    `,
    [
      input.dietPlanId,
      input.consultantId,
      input.currentVersionId,
      input.lifecycle,
      input.approvedBy ?? null,
      timestamp,
      JSON.stringify(input.sourceSnapshot),
    ],
  );
  if (updatedPlan.rowCount === 0) return null;

  const updatedVersion = await pool.query(
    `
      update diet_plan_versions
      set
        lifecycle_status = $3,
        updated_at = $4,
        version = version + 1
      where id = $1
        and diet_plan_id = $2
        and deleted_at is null
      returning *
    `,
    [input.currentVersionId, input.dietPlanId, input.lifecycle, timestamp],
  );

  return {
    plan: mapDietPlan(updatedPlan.rows[0]),
    version: updatedVersion.rowCount ? mapDietPlanVersion(updatedVersion.rows[0]) : null,
  };
};
