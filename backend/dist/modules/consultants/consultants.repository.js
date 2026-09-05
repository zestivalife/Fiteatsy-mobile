import { pool } from '../../db/pool.js';
import { createOrResolveClientForAccount } from '../client/client.repository.js';
import { compareBiomarkerObservations, deriveBiomarkerClinicalStatus } from '../biomarkers/biomarker-clinical-semantics.js';
const AUTHENTICATED_USER_EXCLUSION_ROLES = ['consultant', 'practitioner', 'admin', 'super_admin'];
const PUBLISHED_REPORT_STATUSES = ['PUBLISHED', 'PARTIALLY_VALIDATED'];
const toIso = (value) => {
    if (value == null)
        return null;
    return new Date(String(value)).toISOString();
};
const toNumberOrNull = (value) => {
    if (value == null)
        return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};
const toStringArray = (value) => {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item));
};
const firstString = (value) => {
    const items = toStringArray(value);
    return items[0] ?? null;
};
const maskMobileNumber = (value) => {
    if (value == null)
        return null;
    const digits = String(value).replace(/\D/g, '');
    if (!digits)
        return null;
    if (digits.length <= 4)
        return digits;
    return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};
const profileCompleted = (row) => Boolean(row.health_profile_id) &&
    Boolean(row.gender) &&
    (row.age != null || row.date_of_birth_iso != null) &&
    row.height_cm != null &&
    row.current_weight_kg != null;
const mapOnboardingProjection = (row) => ({
    height: toNumberOrNull(row.height_cm),
    weight: toNumberOrNull(row.current_weight_kg),
    goal: firstString(row.wellness_goals),
    activityLevel: row.activity_level == null ? null : String(row.activity_level),
    dietPreference: row.diet_type == null ? null : String(row.diet_type),
    medicalConditions: row.health_profile_id ? toStringArray(row.primary_conditions) : null,
    lifestyle: {
        sleepHours: toNumberOrNull(row.sleep_hours),
        sleepGoalHours: toNumberOrNull(row.sleep_goal_hours),
        sleepQuality: row.sleep_quality_label == null ? null : String(row.sleep_quality_label),
        stressLevel: row.stress_level_label == null ? null : String(row.stress_level_label),
        smoking: row.smoking_status == null ? null : String(row.smoking_status),
        alcohol: row.alcohol_frequency == null ? null : String(row.alcohol_frequency),
        exerciseFrequency: row.exercise_frequency == null ? null : String(row.exercise_frequency)
    },
    nutrition: {
        dietaryPreference: row.diet_type == null ? null : String(row.diet_type),
        preferredCuisines: toStringArray(row.preferred_cuisines),
        foodAllergies: toStringArray(row.food_allergies),
        foodDislikes: toStringArray(row.foods_disliked),
        mealFrequency: toNumberOrNull(row.meals_per_day),
        waterIntakeLiters: toNumberOrNull(row.water_intake_liters)
    },
    healthHistory: {
        diabetes: row.diabetes_status == null ? null : String(row.diabetes_status),
        hypertension: row.hypertension_status == null ? null : String(row.hypertension_status),
        thyroid: row.thyroid_status == null ? null : String(row.thyroid_status),
        pcos: row.pcos_status == null ? null : String(row.pcos_status),
        cholesterol: row.cholesterol_status == null ? null : String(row.cholesterol_status),
        heartConditions: row.heart_condition_status == null ? null : String(row.heart_condition_status),
        pregnancy: row.pregnancy_status == null ? null : String(row.pregnancy_status),
        breastfeeding: row.breastfeeding_status == null ? null : String(row.breastfeeding_status),
        previousConditions: toStringArray(row.previous_conditions),
        previousSurgeries: toStringArray(row.previous_surgeries),
        familyMedicalHistory: toStringArray(row.family_history_conditions),
        medications: toStringArray(row.current_medicines),
        medicalNotes: row.medical_notes == null ? null : String(row.medical_notes)
    }
});
const eligibleUserPredicate = `
  u.deleted_at is null
  and lower(coalesce(u.status, '')) = 'active'
  and lower(coalesce(u.role, 'user')) not in (${AUTHENTICATED_USER_EXCLUSION_ROLES.map((_, index) => `$${index + 1}`).join(', ')})
`;
// A canonical mobile client can later receive an operational role without
// ceasing to be a client. Keep the strict eligibility predicate for discovery
// and backfill, but allow an explicitly assigned canonical client through the
// Consultant projection. The surrounding assignment clause still scopes the
// record to the authenticated Consultant.
const consultantVisibleUserPredicate = `
  u.deleted_at is null
  and lower(coalesce(u.status, '')) = 'active'
  and (
    lower(coalesce(u.role, 'user')) not in (${AUTHENTICATED_USER_EXCLUSION_ROLES.map((_, index) => `$${index + 1}`).join(', ')})
    or exists (
      select 1
      from consultant_client_assignments role_client_assignment
      where role_client_assignment.client_user_id = u.id
        and role_client_assignment.product = 'FITEATSY'
        and role_client_assignment.professional_type = 'CONSULTANT'
        and role_client_assignment.status = 'active'
    )
  )
`;
const listClientSelect = `
  select
    c.id as internal_client_id,
    c.fiteatsy_client_id,
    c.status as client_status,
    u.id as account_user_id,
    u.name,
    u.email_normalized,
    u.mobile_number_normalized,
    u.status as account_status,
    u.created_at as registered_at,
    greatest(
      coalesce(u.last_login_at, session_stats.last_session_at),
      coalesce(session_stats.last_session_at, u.last_login_at)
    ) as last_active_at,
    hp.id as health_profile_id,
    hp.date_of_birth_iso,
    coalesce(hp.calculated_age, extract(year from age(now(), hp.date_of_birth_iso))::int) as age,
    hp.gender,
    hp.height_cm,
    hp.current_weight_kg,
    hp.waist_cm,
    hp.hip_cm,
    hp.neck_cm,
    hp.wellness_goals,
    hp.activity_level,
    hp.diet_type,
    hp.primary_conditions,
    hp.preferred_cuisines,
    hp.food_allergies,
    hp.foods_disliked,
    hp.current_medicines,
    hp.previous_conditions,
    hp.medical_notes,
    hp.pregnancy_status,
    hp.breastfeeding_status,
    hp.sleep_hours,
    hp.sleep_goal_hours,
    hp.sleep_quality_label,
    hp.water_intake_liters,
    hp.meals_per_day,
    hp.smoking_status,
    hp.alcohol_frequency,
    hp.exercise_frequency,
    hp.stress_level_label,
    hp.family_history_conditions,
    hp.pcos_status,
    hp.thyroid_status,
    hp.diabetes_status,
    hp.hypertension_status,
    hp.cholesterol_status,
    hp.heart_condition_status,
    hp.previous_surgeries,
    report_stats.reports_count,
    active_subscription.subscription_status,
    active_subscription.subscription_plan_name,
    active_subscription.subscription_status is not null as subscription_active,
    case
      when hp.updated_at is null and report_stats.last_report_at is null then null
      else greatest(
        coalesce(hp.updated_at, report_stats.last_report_at),
        coalesce(report_stats.last_report_at, hp.updated_at)
      )
    end as last_health_update
  from users u
  left join lateral (
    select *
    from fiteatsy_clients c
    where c.account_user_id = u.id
    order by
      case
        when c.deleted_at is null and lower(coalesce(c.status, '')) = 'active' then 0
        when c.deleted_at is null then 1
        else 2
      end,
      c.updated_at desc
    limit 1
  ) c on true
  left join health_profiles hp
    on hp.client_id = c.id
    and hp.user_id = u.id
    and hp.deleted_at is null
    and lower(coalesce(hp.status, '')) = 'active'
  left join lateral (
    select max(coalesce(s.last_used_at, s.created_at)) as last_session_at
    from auth_sessions s
    where s.user_id = u.id
      and s.revoked_at is null
  ) session_stats on true
  left join lateral (
    select
      count(*)::int as reports_count,
      max(coalesce(hr.updated_at, hr.created_at)) as last_report_at
    from health_reports hr
    where hr.user_id = u.id
      and hr.client_id = c.id
      and hr.deleted_at is null
      and hr.processing_status = any($5)
  ) report_stats on true
  left join lateral (
    select
      subscriptions.status as subscription_status,
      coalesce(nullif(subscriptions.plan_name_snapshot, ''), plans.name) as subscription_plan_name
    from user_subscriptions subscriptions
    join subscription_plans plans
      on plans.id = subscriptions.plan_id
    where subscriptions.user_id = u.id
      and subscriptions.status = 'ACTIVE'
      and subscriptions.starts_at <= now()
      and subscriptions.expires_at > now()
      and subscriptions.revoked_at is null
    order by subscriptions.expires_at desc, subscriptions.created_at desc
    limit 1
  ) active_subscription on true
  where ${consultantVisibleUserPredicate}
    and c.id is not null
    and c.deleted_at is null
    and lower(coalesce(c.status, '')) = 'active'
`;
const mapListRecord = (row) => ({
    clientId: String(row.fiteatsy_client_id),
    name: String(row.name),
    email: row.email_normalized == null ? null : String(row.email_normalized),
    mobile: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
    mobileNumberMasked: maskMobileNumber(row.mobile_number_normalized),
    registeredAt: new Date(String(row.registered_at)).toISOString(),
    registrationDate: new Date(String(row.registered_at)).toISOString(),
    status: String(row.client_status),
    accountStatus: String(row.account_status),
    age: toNumberOrNull(row.age),
    gender: row.gender == null ? null : String(row.gender),
    height: toNumberOrNull(row.height_cm),
    weight: toNumberOrNull(row.current_weight_kg),
    goal: firstString(row.wellness_goals),
    activityLevel: row.activity_level == null ? null : String(row.activity_level),
    dietPreference: row.diet_type == null ? null : String(row.diet_type),
    medicalConditions: row.health_profile_id ? toStringArray(row.primary_conditions) : null,
    biomarkerStatus: null,
    reportsCount: Number(row.reports_count ?? 0),
    lastHealthUpdate: toIso(row.last_health_update),
    profileCompleted: profileCompleted(row),
    lastActiveAt: toIso(row.last_active_at),
    subscriptionStatus: row.subscription_status == null ? null : String(row.subscription_status),
    subscriptionPlanName: row.subscription_plan_name == null ? null : String(row.subscription_plan_name),
    subscriptionActive: row.subscription_active === true,
    onboarding: {
        ...mapOnboardingProjection(row),
        age: toNumberOrNull(row.age),
        gender: row.gender == null ? null : String(row.gender)
    },
    healthProfile: {
        biomarkerStatus: null,
        reportsCount: Number(row.reports_count ?? 0),
        lastHealthUpdate: toIso(row.last_health_update),
        profileCompleted: profileCompleted(row)
    }
});
export const getConsultantClientSyncDiagnostics = async () => {
    const result = await pool.query(`
      select
        count(distinct u.id)::int as total_users_found,
        count(distinct case when c_active.id is not null then u.id end)::int as clients_mapped,
        count(distinct case when c_active.id is null then u.id end)::int as missing_client_mappings,
        count(distinct case when c_any.id is not null and (c_any.deleted_at is not null or lower(coalesce(c_any.status, '')) <> 'active') then u.id end)::int as inactive_client_mappings,
        count(distinct hp.id)::int as active_health_profiles
      from users u
      left join lateral (
        select *
        from fiteatsy_clients c
        where c.account_user_id = u.id
          and c.deleted_at is null
          and lower(coalesce(c.status, '')) = 'active'
        order by c.updated_at desc
        limit 1
      ) c_active on true
      left join lateral (
        select *
        from fiteatsy_clients c
        where c.account_user_id = u.id
        order by
          case
            when c.deleted_at is null and lower(coalesce(c.status, '')) = 'active' then 0
            when c.deleted_at is null then 1
            else 2
          end,
          c.updated_at desc
        limit 1
      ) c_any on true
      left join health_profiles hp
        on hp.user_id = u.id
        and hp.client_id = c_active.id
        and hp.deleted_at is null
        and lower(coalesce(hp.status, '')) = 'active'
      where ${eligibleUserPredicate}
    `, [...AUTHENTICATED_USER_EXCLUSION_ROLES]);
    const row = result.rows[0] ?? {};
    return {
        totalUsersFound: Number(row.total_users_found ?? 0),
        clientsMapped: Number(row.clients_mapped ?? 0),
        missingClientMappings: Number(row.missing_client_mappings ?? 0),
        inactiveClientMappings: Number(row.inactive_client_mappings ?? 0),
        activeHealthProfiles: Number(row.active_health_profiles ?? 0)
    };
};
export const ensureRegisteredClientsForEligibleUsers = async () => {
    const result = await pool.query(`
      select u.id
      from users u
      left join lateral (
        select *
        from fiteatsy_clients c
        where c.account_user_id = u.id
        order by
          case
            when c.deleted_at is null and lower(coalesce(c.status, '')) = 'active' then 0
            when c.deleted_at is null then 1
            else 2
          end,
          c.updated_at desc
        limit 1
      ) c on true
      where ${eligibleUserPredicate}
        and (
          c.id is null
          or c.deleted_at is not null
          or lower(coalesce(c.status, '')) <> 'active'
        )
      order by u.created_at asc
    `, [...AUTHENTICATED_USER_EXCLUSION_ROLES]);
    for (const row of result.rows) {
        await createOrResolveClientForAccount(String(row.id));
    }
    return result.rowCount;
};
export const listRegisteredConsultantClients = async (consultantAccountId, professionalType = 'CONSULTANT') => {
    const assignmentClause = consultantAccountId
        ? `
        and (
          exists (
            select 1 from consultant_client_assignments cap003
            where cap003.client_user_id = u.id
              and cap003.consultant_user_id = $6
              and cap003.product = 'FITEATSY'
              and cap003.professional_type = $7
              and cap003.status = 'active'
          )
        )
      `
        : '';
    const result = await pool.query(`${listClientSelect}
      ${assignmentClause}
      order by u.created_at desc
    `, consultantAccountId
        ? [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES, consultantAccountId, professionalType]
        : [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES]);
    return result.rows.map((row) => mapListRecord(row));
};
export const listAssignedConsultantClientContexts = async (consultantAccountId) => {
    const result = await pool.query(`
      select
        c.id as internal_client_id,
        c.fiteatsy_client_id,
        u.id as account_user_id,
        u.name,
        u.email_normalized,
        u.mobile_number_normalized,
        coalesce(cc.assigned_consultant_id, hp.assigned_consultant_id) as assigned_consultant_id
      from users u
      join fiteatsy_clients c
        on c.account_user_id = u.id
        and c.deleted_at is null
        and lower(coalesce(c.status, '')) = 'active'
      left join health_profiles hp
        on hp.client_id = c.id
        and hp.user_id = u.id
        and hp.deleted_at is null
        and lower(coalesce(hp.status, '')) = 'active'
      left join care_cases cc
        on cc.client_id = c.id
        and cc.user_id = u.id
        and cc.deleted_at is null
        and lower(coalesce(cc.status, '')) = 'active'
      where ${consultantVisibleUserPredicate}
        and exists (
          select 1 from consultant_client_assignments cap003
          where cap003.client_user_id = u.id
            and cap003.consultant_user_id = $${AUTHENTICATED_USER_EXCLUSION_ROLES.length + 1}
            and cap003.product = 'FITEATSY'
            and cap003.professional_type = 'CONSULTANT'
            and cap003.status = 'active'
        )
      order by u.name asc, u.created_at desc
    `, [...AUTHENTICATED_USER_EXCLUSION_ROLES, consultantAccountId]);
    return result.rows.map((row) => ({
        accountId: String(row.account_user_id),
        internalClientId: String(row.internal_client_id),
        publicClientId: String(row.fiteatsy_client_id),
        name: String(row.name),
        email: row.email_normalized == null ? null : String(row.email_normalized),
        mobileNumberMasked: maskMobileNumber(row.mobile_number_normalized),
        assignedConsultantId: row.assigned_consultant_id == null ? null : String(row.assigned_consultant_id)
    }));
};
export const getRegisteredConsultantClientProfile = async (publicClientId) => {
    const context = await getRegisteredConsultantClientProfileContext(publicClientId);
    return context?.profile ?? null;
};
export const getRegisteredConsultantClientProfileContext = async (publicClientId, consultantAccountId, professionalType = 'CONSULTANT') => {
    const assignmentClause = consultantAccountId
        ? `
        and (
          exists (
            select 1 from consultant_client_assignments cap003
            where cap003.client_user_id = u.id
              and cap003.consultant_user_id = $7
              and cap003.product = 'FITEATSY'
              and cap003.professional_type = $8
              and cap003.status = 'active'
          )
        )
      `
        : '';
    const result = await pool.query(`${listClientSelect}
      and c.fiteatsy_client_id = $6
      ${assignmentClause}
      order by hp.updated_at desc nulls last
      limit 1
    `, consultantAccountId
        ? [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES, publicClientId, consultantAccountId, professionalType]
        : [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES, publicClientId]);
    const row = result.rows[0];
    if (!row)
        return null;
    const profile = {
        client: {
            id: String(row.fiteatsy_client_id),
            name: String(row.name),
            email: row.email_normalized == null ? null : String(row.email_normalized),
            mobile: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
            mobileNumberMasked: maskMobileNumber(row.mobile_number_normalized),
            registrationDate: new Date(String(row.registered_at)).toISOString(),
            status: String(row.client_status),
            accountStatus: String(row.account_status),
            dob: toIso(row.date_of_birth_iso),
            age: toNumberOrNull(row.age),
            gender: row.gender == null ? null : String(row.gender)
        },
        onboarding: mapOnboardingProjection(row),
        healthProfile: {
            biomarkerStatus: null,
            reportsCount: Number(row.reports_count ?? 0),
            lastHealthUpdate: toIso(row.last_health_update),
            profileCompleted: profileCompleted(row)
        }
    };
    return {
        accountId: String(row.account_user_id),
        internalClientId: String(row.internal_client_id),
        profile,
        calculationInput: {
            age: toNumberOrNull(row.age),
            gender: row.gender == null ? null : String(row.gender),
            heightCm: toNumberOrNull(row.height_cm),
            weightKg: toNumberOrNull(row.current_weight_kg),
            waistCm: toNumberOrNull(row.waist_cm),
            hipCm: toNumberOrNull(row.hip_cm),
            neckCm: toNumberOrNull(row.neck_cm),
            activityLevel: row.activity_level == null ? null : String(row.activity_level)
        }
    };
};
export const listValidatedBiomarkerSummaryForClient = async (internalClientId, accountId) => {
    const result = await pool.query(`
      with ranked as (
        select
          bo.*,
          b.canonical_name,
          hr.report_date,
          hr.lab_name,
          hr.original_filename,
          row_number() over (
            partition by bo.biomarker_id
            order by bo.test_date desc, bo.created_at desc
          ) as observation_rank
        from biomarker_observations bo
        join biomarkers b on b.id = bo.biomarker_id
        left join health_reports hr on hr.id = bo.source_report_id
        where bo.client_id = $1
          and bo.user_id = $2
          and bo.validation_status = 'validated'
          and (bo.source_report_id is null or (hr.deleted_at is null and hr.processing_status <> 'DELETED'))
      )
      select
        latest.biomarker_id,
        latest.canonical_name,
        latest.original_parameter_name,
        latest.source_report_id,
        latest.value,
        latest.unit,
        latest.validation_status,
        latest.reference_range,
        latest.confidence,
        latest.test_date,
        latest.created_at,
        latest.report_date,
        latest.lab_name,
        latest.original_filename,
        previous.value as previous_value,
        previous.unit as previous_unit,
        previous.reference_range as previous_reference_range,
        previous.validation_status as previous_validation_status,
        previous.source_report_id as previous_source_report_id,
        previous.test_date as previous_test_date,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'observationId', history.id,
            'value', history.value,
            'unit', history.unit,
            'referenceRange', history.reference_range,
            'validationStatus', upper(history.validation_status),
            'testDate', history.test_date,
            'rawMarkerName', history.original_parameter_name,
            'sourceReportId', history.source_report_id,
            'reportDate', history.report_date,
            'labName', history.lab_name,
            'fileName', history.original_filename,
            'createdAtISO', history.created_at
          ) order by history.test_date desc, history.created_at desc)
          from ranked history
          where history.biomarker_id = latest.biomarker_id
        ), '[]'::jsonb) as history
      from ranked latest
      left join ranked previous
        on previous.biomarker_id = latest.biomarker_id
        and previous.observation_rank = 2
      where latest.observation_rank = 1
      order by latest.test_date desc, latest.canonical_name asc
    `, [internalClientId, accountId]);
    return result.rows.map((row) => {
        const value = Number(row.value);
        const previousValue = row.previous_value == null ? null : Number(row.previous_value);
        const validationStatus = String(row.validation_status).toUpperCase();
        const referenceRange = row.reference_range == null ? null : String(row.reference_range);
        const unit = String(row.unit);
        const clinicalStatus = deriveBiomarkerClinicalStatus({ value, unit, referenceRange, validationStatus });
        const previousUnit = row.previous_unit == null ? null : String(row.previous_unit);
        const previousReferenceRange = row.previous_reference_range == null ? null : String(row.previous_reference_range);
        const previousClinicalStatus = previousValue == null || previousUnit == null
            ? null
            : deriveBiomarkerClinicalStatus({
                value: previousValue,
                unit: previousUnit,
                referenceRange: previousReferenceRange,
                validationStatus: String(row.previous_validation_status ?? '')
            });
        const toSource = (source) => ({
            type: source.sourceReportId == null ? 'manual_entry' : 'lab_report',
            label: source.sourceReportId == null ? 'Manual Entry' : 'Lab Report',
            reportId: source.sourceReportId == null ? null : String(source.sourceReportId),
            reportDate: source.reportDate == null ? null : new Date(String(source.reportDate)).toISOString().slice(0, 10),
            labName: source.labName == null ? null : String(source.labName),
            fileName: source.fileName == null ? null : String(source.fileName)
        });
        const history = (Array.isArray(row.history) ? row.history : []).map((item) => {
            const historyValue = Number(item.value);
            const historyUnit = String(item.unit);
            const historyReferenceRange = item.referenceRange == null ? null : String(item.referenceRange);
            const historyValidationStatus = String(item.validationStatus);
            return {
                observationId: String(item.observationId),
                value: historyValue,
                unit: historyUnit,
                referenceRange: historyReferenceRange,
                validationStatus: historyValidationStatus,
                clinicalStatus: deriveBiomarkerClinicalStatus({
                    value: historyValue,
                    unit: historyUnit,
                    referenceRange: historyReferenceRange,
                    validationStatus: historyValidationStatus
                }),
                testDate: new Date(String(item.testDate)).toISOString().slice(0, 10),
                rawMarkerName: item.rawMarkerName == null ? null : String(item.rawMarkerName),
                source: toSource({
                    sourceReportId: item.sourceReportId,
                    reportDate: item.reportDate,
                    labName: item.labName,
                    fileName: item.fileName
                }),
                createdAtISO: new Date(String(item.createdAtISO)).toISOString()
            };
        });
        return {
            biomarkerId: String(row.biomarker_id),
            name: String(row.canonical_name),
            canonicalMarkerName: String(row.canonical_name),
            rawMarkerName: row.original_parameter_name == null ? null : String(row.original_parameter_name),
            sourceReportId: row.source_report_id == null ? null : String(row.source_report_id),
            value,
            unit,
            validationStatus,
            clinicalStatus,
            referenceRange,
            confidence: Number(row.confidence),
            testDate: new Date(String(row.test_date)).toISOString().slice(0, 10),
            comparisonStatus: compareBiomarkerObservations({ value, unit, referenceRange, clinicalStatus }, previousValue == null || previousUnit == null || previousClinicalStatus == null
                ? null
                : { value: previousValue, unit: previousUnit, referenceRange: previousReferenceRange, clinicalStatus: previousClinicalStatus }),
            previousValue,
            previousUnit,
            previousReferenceRange,
            previousClinicalStatus,
            previousSourceReportId: row.previous_source_report_id == null ? null : String(row.previous_source_report_id),
            previousTestDate: row.previous_test_date == null ? null : new Date(String(row.previous_test_date)).toISOString().slice(0, 10),
            source: toSource({
                sourceReportId: row.source_report_id,
                reportDate: row.report_date,
                labName: row.lab_name,
                fileName: row.original_filename
            }),
            createdAtISO: new Date(String(row.created_at)).toISOString(),
            history
        };
    });
};
export const listConsultantReportSummariesForClient = async (internalClientId, accountId, limit = 12) => {
    const result = await pool.query(`
      select
        hr.id,
        hr.report_type,
        hr.original_filename,
        hr.processing_status,
        hr.report_date,
        hr.lab_name,
        hr.file_size,
        hr.created_at,
        hr.updated_at,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'biomarkerId', bo.biomarker_id,
              'canonicalMarkerName', b.canonical_name,
              'rawMarkerName', bo.original_parameter_name,
              'sourceReportId', bo.source_report_id,
              'value', bo.value,
              'unit', bo.unit,
              'validationStatus', upper(bo.validation_status),
              'referenceRange', bo.reference_range,
              'confidence', bo.confidence,
              'testDate', bo.test_date
            ) order by b.canonical_name asc
          ) filter (where bo.id is not null),
          '[]'::jsonb
        ) as biomarkers
      from health_reports hr
      left join biomarker_observations bo
        on bo.source_report_id = hr.id
        and bo.client_id = hr.client_id
        and bo.user_id = hr.user_id
        and bo.validation_status = 'validated'
      left join biomarkers b on b.id = bo.biomarker_id
      where hr.client_id = $1
        and hr.user_id = $2
        and hr.deleted_at is null
      group by hr.id
      order by hr.updated_at desc, hr.created_at desc
      limit $3
    `, [internalClientId, accountId, limit]);
    return result.rows.map((row) => ({
        id: String(row.id),
        reportType: String(row.report_type),
        originalFilename: String(row.original_filename),
        processingStatus: String(row.processing_status),
        reportDate: row.report_date == null ? null : String(row.report_date),
        labName: row.lab_name == null ? null : String(row.lab_name),
        fileSize: Number(row.file_size),
        uploadedAt: new Date(String(row.created_at)).toISOString(),
        updatedAt: new Date(String(row.updated_at)).toISOString(),
        biomarkers: (Array.isArray(row.biomarkers) ? row.biomarkers : []).map((marker) => {
            const value = Number(marker.value);
            const unit = String(marker.unit);
            const referenceRange = marker.referenceRange == null ? null : String(marker.referenceRange);
            const validationStatus = String(marker.validationStatus);
            return {
                biomarkerId: String(marker.biomarkerId),
                canonicalMarkerName: String(marker.canonicalMarkerName),
                rawMarkerName: marker.rawMarkerName == null ? null : String(marker.rawMarkerName),
                sourceReportId: String(marker.sourceReportId),
                value,
                unit,
                validationStatus,
                clinicalStatus: deriveBiomarkerClinicalStatus({ value, unit, referenceRange, validationStatus }),
                referenceRange,
                confidence: Number(marker.confidence),
                testDate: new Date(String(marker.testDate)).toISOString().slice(0, 10)
            };
        })
    }));
};
export const getConsultantWearableSummaryForClient = async (internalClientId, accountId) => {
    const summaryResult = await pool.query(`
      select
        count(*)::int as records_count,
        max(measured_at) as last_synced_at,
        array_remove(array_agg(distinct source_provider), null) as data_sources
      from health_observations
      where client_id = $1
        and user_id = $2
        and quality_status in ('accepted', 'estimated')
    `, [internalClientId, accountId]);
    const metricResult = await pool.query(`
      with ranked as (
        select
          metric_type,
          value,
          unit,
          measured_at,
          source_provider,
          count(*) over (partition by metric_type)::int as accepted_records,
          row_number() over (partition by metric_type order by measured_at desc, created_at desc) as metric_rank
        from health_observations
        where client_id = $1
          and user_id = $2
          and quality_status in ('accepted', 'estimated')
      )
      select *
      from ranked
      where metric_rank = 1
      order by measured_at desc
      limit 10
    `, [internalClientId, accountId]);
    const summary = summaryResult.rows[0] ?? {};
    const dataSources = Array.isArray(summary.data_sources) ? summary.data_sources.map((item) => String(item)) : [];
    return {
        connected: Number(summary.records_count ?? 0) > 0,
        lastSyncedAt: toIso(summary.last_synced_at),
        dataSources,
        recordsCount: Number(summary.records_count ?? 0),
        latestMetrics: metricResult.rows.map((row) => ({
            metricType: String(row.metric_type),
            latestValue: Number(row.value),
            unit: String(row.unit),
            measuredAt: new Date(String(row.measured_at)).toISOString(),
            sourceProvider: String(row.source_provider),
            acceptedRecords: Number(row.accepted_records ?? 0)
        }))
    };
};
export const listConsultantTimelineForClient = async (internalClientId, accountId, limit = 20) => {
    const result = await pool.query(`
      select *
      from (
        select
          'registration' as type,
          'Client registered' as title,
          coalesce(u.name, 'Client') || ' joined Fiteatsy.' as detail,
          u.created_at as timestamp,
          'account' as source
        from users u
        where u.id = $2

        union all

        select
          'profile_updated' as type,
          'Health profile updated' as title,
          'Profile and onboarding information changed.' as detail,
          hp.updated_at as timestamp,
          'profile' as source
        from health_profiles hp
        where hp.client_id = $1
          and hp.user_id = $2
          and hp.deleted_at is null

        union all

        select
          'report_uploaded' as type,
          'Report uploaded' as title,
          hr.original_filename || ' is ' || lower(hr.processing_status) || '.' as detail,
          coalesce(hr.updated_at, hr.created_at) as timestamp,
          'report' as source
        from health_reports hr
        where hr.client_id = $1
          and hr.user_id = $2
          and hr.deleted_at is null

        union all

        select
          'biomarker_validated' as type,
          'Biomarker validated' as title,
          b.canonical_name || ' captured at ' || bo.value::text || ' ' || bo.unit || '.' as detail,
          bo.created_at as timestamp,
          'biomarker' as source
        from biomarker_observations bo
        join biomarkers b on b.id = bo.biomarker_id
        where bo.client_id = $1
          and bo.user_id = $2
          and bo.validation_status = 'validated'

        union all

        select
          'wearable_synced' as type,
          'Health data synced' as title,
          ho.metric_type || ' updated from ' || ho.source_provider || '.' as detail,
          ho.measured_at as timestamp,
          'wearable' as source
        from health_observations ho
        where ho.client_id = $1
          and ho.user_id = $2
          and ho.quality_status in ('accepted', 'estimated')
      ) events
      order by timestamp desc
      limit $3
    `, [internalClientId, accountId, limit]);
    return result.rows.map((row) => ({
        type: String(row.type),
        title: String(row.title),
        detail: String(row.detail),
        timestamp: new Date(String(row.timestamp)).toISOString(),
        source: String(row.source)
    }));
};
