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
  submittedAtISO: toIso(row.submitted_at),
  reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
  reviewedAtISO: toIso(row.reviewed_at),
  reviewComment: row.review_comment == null ? null : String(row.review_comment),
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
      earlyMorning: { window: '', focus: '', options: [], availableOptions: [] },
      breakfast: { window: '', focus: '', options: [], availableOptions: [] },
      midMorningSnack: { window: '', focus: '', options: [], availableOptions: [] },
      lunch: { window: '', focus: '', options: [], availableOptions: [] },
      eveningSnack: { window: '', focus: '', options: [], availableOptions: [] },
      dinner: { window: '', focus: '', options: [], availableOptions: [] },
      bedtimeNutrition: { window: '', focus: '', options: [], availableOptions: [] },
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

export const listDietPlanReviewQueue = async () => {
  const result = await pool.query(
    `select dp.id, dp.user_id, dp.consultant_id, dp.plan_status, dp.updated_at, dp.submitted_at,
            dp.review_comment, client.name as client_name,
            coalesce(nullif(trim(concat_ws(' ', consultant.first_name, consultant.last_name)), ''), consultant.name) as consultant_name,
            fiteatsy_client.fiteatsy_client_id as public_client_id,
            dpv.id as version_id, dpv.version_number, dpv.content, dpv.content_summary, dpv.lifecycle_status,
            coalesce((select json_agg(json_build_object(
              'eventType', events.event_type,
              'comment', events.comment,
              'actorUserId', events.actor_user_id,
              'createdAtISO', events.created_at
            ) order by events.created_at asc)
            from diet_plan_review_events events
            where events.diet_plan_id = dp.id), '[]'::json) as review_history
       from diet_plans dp
       join diet_plan_versions dpv on dpv.id = dp.current_version_id
       join users client on client.id = dp.user_id
       left join users consultant on consultant.id = dp.consultant_id
       left join lateral (
         select c.fiteatsy_client_id
         from fiteatsy_clients c
         where c.account_user_id = dp.user_id
           and c.deleted_at is null
           and lower(coalesce(c.status, '')) = 'active'
         order by c.updated_at desc
         limit 1
       ) fiteatsy_client on true
      where dp.deleted_at is null
        and dpv.deleted_at is null
        and dp.plan_status in ('submitted_for_review', 'changes_requested')
      order by dp.submitted_at desc nulls last, dp.updated_at desc`,
  );
  return result.rows.map((row) => ({
    dietPlanId: String(row.id),
    clientUserId: String(row.user_id),
    clientId: row.public_client_id == null ? null : String(row.public_client_id),
    clientName: String(row.client_name),
    consultantUserId: row.consultant_id == null ? null : String(row.consultant_id),
    consultantName: row.consultant_name == null ? null : String(row.consultant_name),
    planStatus: String(row.plan_status),
    submittedAtISO: toIso(row.submitted_at),
    updatedAtISO: toIso(row.updated_at),
    reviewComment: row.review_comment == null ? null : String(row.review_comment),
    version: {
      id: String(row.version_id),
      versionNumber: Number(row.version_number),
      lifecycleStatus: String(row.lifecycle_status),
      content: toRecord(row.content, {}),
      contentSummary: (() => {
        const summary = toRecord<Record<string, unknown>>(row.content_summary, {});
        const content = toRecord<Record<string, unknown>>(row.content, {});
        const dailyTargets = toRecord<Record<string, unknown>>(content.dailyTargets, {});
        return {
          ...summary,
          calories: summary.calories ?? dailyTargets.calories ?? null,
          protein: summary.protein ?? dailyTargets.protein ?? null,
          hydration: summary.hydration ?? dailyTargets.hydration ?? null,
        };
      })(),
    },
    reviewHistory: Array.isArray(row.review_history) ? row.review_history : [],
  }));
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
      select dp.*
      from care_cases cc
      join diet_plans dp on dp.care_case_id = cc.id
      where cc.client_id = $1
        and cc.user_id = $2
        and cc.deleted_at is null
        and dp.deleted_at is null
        and dp.status = 'active'
        and dp.latest_published_version_id is not null
      order by dp.published_at desc nulls last, dp.updated_at desc
      limit 1
    `,
    [owner.clientId, owner.accountId],
  );
  if (result.rowCount === 0) return null;
  const plan = mapDietPlan(result.rows[0]);
  const version = plan.latestPublishedVersionId
    ? await getDietPlanVersionById(plan.latestPublishedVersionId)
    : null;
  if (!version || version.deletedAtISO || version.status !== 'active') return null;
  return {
    plan,
    version,
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
        submitted_at = null,
        reviewed_by = null,
        reviewed_at = null,
        review_comment = null,
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
        updated_at = $8
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

export const createDietPlanDraftVersion = async (input: {
  dietPlanId: string;
  content: NutritionPlanContent;
  contentSummary: DietPlanVersionRecord['contentSummary'];
  sourceSnapshot: NutritionPlanSourceSnapshot;
  generatedBy: string;
  reviewNotes?: string | null;
}) => {
  const timestamp = nowIso();
  const nextVersion = await pool.query(
    `
      with next_number as (
        select coalesce(max(version_number), 0) + 1 as version_number
        from diet_plan_versions
        where diet_plan_id = $8 and deleted_at is null
      )
      insert into diet_plan_versions (
        id, diet_plan_id, version_number, generated_by, content, source_snapshot, content_summary,
        lifecycle_status, review_notes, exported_doc_path, exported_pdf_path, status, created_at, updated_at, deleted_at
      )
      values (
        $1, $8, (select version_number from next_number), $2, $3::jsonb, $4::jsonb, $5::jsonb,
        'draft', $6, null, null, 'active', $7, $7, null
      )
      returning *
    `,
    [
      crypto.randomUUID(),
      input.generatedBy,
      JSON.stringify(input.content),
      JSON.stringify(input.sourceSnapshot),
      JSON.stringify(input.contentSummary),
      input.reviewNotes ?? null,
      timestamp,
      input.dietPlanId,
    ],
  );
  const updatedPlan = await pool.query(
    `
      update diet_plans
      set current_version_id = $2,
          plan_status = 'draft',
          submitted_at = null,
          reviewed_by = null,
          reviewed_at = null,
          review_comment = null,
          source_snapshot = $3::jsonb,
          updated_at = $4,
          version = version + 1
      where id = $1 and deleted_at is null
      returning *
    `,
    [input.dietPlanId, nextVersion.rows[0].id, JSON.stringify(input.sourceSnapshot), timestamp],
  );
  if (updatedPlan.rowCount === 0) return null;
  return {
    plan: mapDietPlan(updatedPlan.rows[0]),
    version: mapDietPlanVersion(nextVersion.rows[0]),
  };
};

export const updateDietPlanLifecycle = async (input: {
  dietPlanId: string;
  consultantId: string;
  lifecycle: NutritionPlanLifecycle;
  currentVersionId: string;
  approvedBy?: string | null;
  reviewComment?: string | null;
  reviewEventType?: 'submitted_for_review' | 'changes_requested' | 'resubmitted' | 'approved' | 'published';
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
        submitted_at = case when $4 in ('submitted_for_review', 'changes_requested') and submitted_at is null then $6 else submitted_at end,
        reviewed_by = case when $4 in ('changes_requested', 'approved', 'published') then $2 else reviewed_by end,
        reviewed_at = case when $4 in ('changes_requested', 'approved', 'published') then $6 else reviewed_at end,
        review_comment = case when $4 = 'changes_requested' then $8 else review_comment end,
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
      input.reviewComment ?? null,
    ],
  );
  if (updatedPlan.rowCount === 0) return null;

  const updatedVersion = await pool.query(
    `
      update diet_plan_versions
      set
        lifecycle_status = $3,
        updated_at = $4
      where id = $1
        and diet_plan_id = $2
        and deleted_at is null
      returning *
    `,
    [input.currentVersionId, input.dietPlanId, input.lifecycle, timestamp],
  );

  if (input.reviewEventType) {
    await pool.query(
      `insert into diet_plan_review_events (id, diet_plan_id, diet_plan_version_id, actor_user_id, event_type, comment)
       values ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), input.dietPlanId, input.currentVersionId, input.consultantId, input.reviewEventType, input.reviewComment ?? null],
    );
  }

  return {
    plan: mapDietPlan(updatedPlan.rows[0]),
    version: updatedVersion.rowCount ? mapDietPlanVersion(updatedVersion.rows[0]) : null,
  };
};

export const publishApprovedDietPlanVersion = async (input: {
  dietPlanId: string;
  versionId: string;
  publishedBy: string;
  sourceSnapshot: NutritionPlanSourceSnapshot;
}) => {
  const client = await pool.connect();
  const timestamp = nowIso();
  try {
    await client.query('begin');
    const versionResult = await client.query(
      `
        update diet_plan_versions
        set lifecycle_status = 'published',
            updated_at = $3
        where id = $1
          and diet_plan_id = $2
          and lifecycle_status in ('approved', 'published')
          and deleted_at is null
        returning *
      `,
      [input.versionId, input.dietPlanId, timestamp],
    );
    if (versionResult.rowCount === 0) {
      await client.query('rollback');
      return null;
    }

    const planResult = await client.query(
      `
        update diet_plans
        set latest_published_version_id = $2,
            plan_status = 'published',
            approved_by = coalesce(approved_by, $3),
            approved_at = coalesce(approved_at, $4),
            published_at = case when latest_published_version_id = $2 then published_at else $4 end,
            reviewed_by = $3,
            reviewed_at = $4,
            source_snapshot = $5::jsonb,
            updated_at = $4,
            version = version + 1
        where id = $1
          and deleted_at is null
        returning *
      `,
      [input.dietPlanId, input.versionId, input.publishedBy, timestamp, JSON.stringify(input.sourceSnapshot)],
    );
    if (planResult.rowCount === 0) {
      await client.query('rollback');
      return null;
    }

    await client.query(
      `insert into diet_plan_review_events (id, diet_plan_id, diet_plan_version_id, actor_user_id, event_type, comment)
       select $1, $2, $3, $4, 'published', null
       where not exists (
         select 1 from diet_plan_review_events
         where diet_plan_id = $2 and diet_plan_version_id = $3 and event_type = 'published'
       )`,
      [crypto.randomUUID(), input.dietPlanId, input.versionId, input.publishedBy],
    );
    await client.query('commit');
    return {
      plan: mapDietPlan(planResult.rows[0]),
      version: mapDietPlanVersion(versionResult.rows[0]),
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};


export const updateDietPlanVersionExportPaths = async (input: {
  dietPlanId: string;
  versionId: string;
  exportedDocPath?: string | null;
  exportedPdfPath?: string | null;
}) => {
  const timestamp = nowIso();
  const updated = await pool.query(
    `
      update diet_plan_versions
      set
        exported_doc_path = coalesce($3, exported_doc_path),
        exported_pdf_path = coalesce($4, exported_pdf_path),
        updated_at = $5
      where id = $1
        and diet_plan_id = $2
        and deleted_at is null
      returning *
    `,
    [
      input.versionId,
      input.dietPlanId,
      input.exportedDocPath ?? null,
      input.exportedPdfPath ?? null,
      timestamp,
    ],
  );
  if (updated.rowCount === 0) return null;
  return mapDietPlanVersion(updated.rows[0]);
};
