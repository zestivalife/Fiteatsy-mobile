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
    const result = await pool.query(`${listClientSelect}
      and c.fiteatsy_client_id = $6
      order by hp.updated_at desc nulls last
      limit 1
    `, [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES, publicClientId]);
    const row = result.rows[0];
    if (!row)
        return null;
    return {
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
};
