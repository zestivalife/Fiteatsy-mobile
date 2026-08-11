import { pool } from '../../db/pool.js';
import { createOrResolveClientForAccount } from '../client/client.repository.js';
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
const eligibleUserPredicate = `
  u.deleted_at is null
  and u.status = 'active'
  and coalesce(u.role, 'user') not in (${AUTHENTICATED_USER_EXCLUSION_ROLES.map((_, index) => `$${index + 1}`).join(', ')})
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
    report_stats.reports_count,
    case
      when hp.updated_at is null and report_stats.last_report_at is null then null
      else greatest(
        coalesce(hp.updated_at, report_stats.last_report_at),
        coalesce(report_stats.last_report_at, hp.updated_at)
      )
    end as last_health_update
  from fiteatsy_clients c
  join users u on u.id = c.account_user_id
  left join health_profiles hp
    on hp.client_id = c.id
    and hp.user_id = u.id
    and hp.deleted_at is null
    and hp.status = 'active'
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
  where c.deleted_at is null
    and c.status = 'active'
    and ${eligibleUserPredicate}
`;
const mapListRecord = (row) => ({
    clientId: String(row.fiteatsy_client_id),
    name: String(row.name),
    email: row.email_normalized == null ? null : String(row.email_normalized),
    mobile: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
    mobileNumberMasked: maskMobileNumber(row.mobile_number_normalized),
    registeredAt: new Date(String(row.registered_at)).toISOString(),
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
    lastActiveAt: toIso(row.last_active_at)
});
export const ensureRegisteredClientsForEligibleUsers = async () => {
    const result = await pool.query(`
      select u.id
      from users u
      left join fiteatsy_clients c
        on c.account_user_id = u.id
        and c.deleted_at is null
      where ${eligibleUserPredicate}
        and c.id is null
      order by u.created_at asc
    `, [...AUTHENTICATED_USER_EXCLUSION_ROLES]);
    for (const row of result.rows) {
        await createOrResolveClientForAccount(String(row.id));
    }
    return result.rowCount;
};
export const listRegisteredConsultantClients = async () => {
    const result = await pool.query(`${listClientSelect}
      order by u.created_at desc
    `, [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES]);
    return result.rows.map((row) => mapListRecord(row));
};
export const getRegisteredConsultantClientProfile = async (publicClientId) => {
    const context = await getRegisteredConsultantClientProfileContext(publicClientId);
    return context?.profile ?? null;
};
export const getRegisteredConsultantClientProfileContext = async (publicClientId) => {
    const result = await pool.query(`${listClientSelect}
      and c.fiteatsy_client_id = $6
      order by hp.updated_at desc nulls last
      limit 1
    `, [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES, publicClientId]);
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
        onboarding: {
            height: toNumberOrNull(row.height_cm),
            weight: toNumberOrNull(row.current_weight_kg),
            goal: firstString(row.wellness_goals),
            activityLevel: row.activity_level == null ? null : String(row.activity_level),
            dietPreference: row.diet_type == null ? null : String(row.diet_type),
            medicalConditions: row.health_profile_id ? toStringArray(row.primary_conditions) : null
        },
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
        latest.value,
        latest.unit,
        latest.reference_range,
        latest.confidence,
        latest.test_date,
        previous.value as previous_value,
        previous.test_date as previous_test_date
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
        const trend = previousValue == null ? null : value > previousValue ? 'UP' : value < previousValue ? 'DOWN' : 'STABLE';
        return {
            biomarkerId: String(row.biomarker_id),
            name: String(row.canonical_name),
            value,
            unit: String(row.unit),
            status: 'VALIDATED',
            referenceRange: row.reference_range == null ? null : String(row.reference_range),
            confidence: Number(row.confidence),
            testDate: new Date(String(row.test_date)).toISOString().slice(0, 10),
            trend,
            previousValue,
            previousTestDate: row.previous_test_date == null ? null : new Date(String(row.previous_test_date)).toISOString().slice(0, 10)
        };
    });
};
