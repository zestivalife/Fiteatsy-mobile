import { pool } from '../../db/pool.js';
import { createOrResolveClientForAccount } from '../client/client.repository.js';
import type { HealthCalculationInput, HealthMetrics } from '../health/health-calculations.service.js';

export type ConsultantClientListRecord = {
  clientId: string;
  name: string;
  email: string | null;
  mobile: string | null;
  mobileNumberMasked: string | null;
  registeredAt: string;
  registrationDate: string;
  status: string;
  accountStatus: string;
  age: number | null;
  gender: string | null;
  height: number | null;
  weight: number | null;
  goal: string | null;
  activityLevel: string | null;
  dietPreference: string | null;
  medicalConditions: string[] | null;
  biomarkerStatus: string | null;
  reportsCount: number;
  lastHealthUpdate: string | null;
  profileCompleted: boolean;
  lastActiveAt: string | null;
  onboarding: {
    age: number | null;
    gender: string | null;
    height: number | null;
    weight: number | null;
    goal: string | null;
    activityLevel: string | null;
    dietPreference: string | null;
    medicalConditions: string[] | null;
  };
  healthProfile: {
    biomarkerStatus: string | null;
    reportsCount: number;
    lastHealthUpdate: string | null;
    profileCompleted: boolean;
  };
};

export type ConsultantClientProfileRecord = {
  client: {
    id: string;
    name: string;
    email: string | null;
    mobile: string | null;
    mobileNumberMasked: string | null;
    registrationDate: string;
    status: string;
    accountStatus: string;
    dob: string | null;
    age: number | null;
    gender: string | null;
  };
  onboarding: {
    height: number | null;
    weight: number | null;
    goal: string | null;
    activityLevel: string | null;
    dietPreference: string | null;
    medicalConditions: string[] | null;
  };
  healthProfile: {
    biomarkerStatus: string | null;
    reportsCount: number;
    lastHealthUpdate: string | null;
    profileCompleted: boolean;
  };
  healthMetrics?: HealthMetrics;
  biomarkers?: ConsultantBiomarkerSummary[];
};

export type ConsultantBiomarkerSummary = {
  biomarkerId: string;
  name: string;
  value: number;
  unit: string;
  status: 'VALIDATED';
  referenceRange: string | null;
  confidence: number;
  testDate: string;
  trend: 'UP' | 'DOWN' | 'STABLE' | null;
  previousValue: number | null;
  previousTestDate: string | null;
};

export type ConsultantReportSummary = {
  id: string;
  reportType: string;
  originalFilename: string;
  processingStatus: string;
  reportDate: string | null;
  labName: string | null;
  fileSize: number;
  uploadedAt: string;
  updatedAt: string;
};

export type ConsultantWearableMetricSummary = {
  metricType: string;
  latestValue: number;
  unit: string;
  measuredAt: string;
  sourceProvider: string;
  acceptedRecords: number;
};

export type ConsultantWearableSummary = {
  connected: boolean;
  lastSyncedAt: string | null;
  dataSources: string[];
  recordsCount: number;
  latestMetrics: ConsultantWearableMetricSummary[];
};

export type ConsultantTimelineEvent = {
  type: string;
  title: string;
  detail: string;
  timestamp: string;
  source: 'account' | 'profile' | 'report' | 'biomarker' | 'wearable';
};

export type ConsultantClientProfileContext = {
  accountId: string;
  internalClientId: string;
  profile: ConsultantClientProfileRecord;
  calculationInput: HealthCalculationInput;
};

export type ConsultantClientSyncDiagnostics = {
  totalUsersFound: number;
  clientsMapped: number;
  missingClientMappings: number;
  inactiveClientMappings: number;
  activeHealthProfiles: number;
};

const AUTHENTICATED_USER_EXCLUSION_ROLES = ['consultant', 'practitioner', 'admin', 'super_admin'];
const PUBLISHED_REPORT_STATUSES = ['PUBLISHED', 'PARTIALLY_VALIDATED'];

const toIso = (value: unknown) => {
  if (value == null) return null;
  return new Date(String(value)).toISOString();
};

const toNumberOrNull = (value: unknown) => {
  if (value == null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
};

const firstString = (value: unknown) => {
  const items = toStringArray(value);
  return items[0] ?? null;
};

const maskMobileNumber = (value: unknown) => {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const profileCompleted = (row: Record<string, unknown>) =>
  Boolean(row.health_profile_id) &&
  Boolean(row.gender) &&
  (row.age != null || row.date_of_birth_iso != null) &&
  row.height_cm != null &&
  row.current_weight_kg != null;

const eligibleUserPredicate = `
  u.deleted_at is null
  and lower(coalesce(u.status, '')) = 'active'
  and lower(coalesce(u.role, 'user')) not in (${AUTHENTICATED_USER_EXCLUSION_ROLES.map((_, index) => `$${index + 1}`).join(', ')})
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
  where ${eligibleUserPredicate}
    and c.id is not null
    and c.deleted_at is null
    and lower(coalesce(c.status, '')) = 'active'
`;

const mapListRecord = (row: Record<string, unknown>): ConsultantClientListRecord => ({
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
  onboarding: {
    age: toNumberOrNull(row.age),
    gender: row.gender == null ? null : String(row.gender),
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
});

export const getConsultantClientSyncDiagnostics = async (): Promise<ConsultantClientSyncDiagnostics> => {
  const result = await pool.query(
    `
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
    `,
    [...AUTHENTICATED_USER_EXCLUSION_ROLES]
  );
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
  const result = await pool.query(
    `
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
    `,
    [...AUTHENTICATED_USER_EXCLUSION_ROLES]
  );

  for (const row of result.rows) {
    await createOrResolveClientForAccount(String(row.id));
  }

  return result.rowCount;
};

export const listRegisteredConsultantClients = async (): Promise<ConsultantClientListRecord[]> => {
  const result = await pool.query(
    `${listClientSelect}
      order by u.created_at desc
    `,
    [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES]
  );

  return result.rows.map((row) => mapListRecord(row));
};

export const getRegisteredConsultantClientProfile = async (
  publicClientId: string
): Promise<ConsultantClientProfileRecord | null> => {
  const context = await getRegisteredConsultantClientProfileContext(publicClientId);
  return context?.profile ?? null;
};

export const getRegisteredConsultantClientProfileContext = async (
  publicClientId: string
): Promise<ConsultantClientProfileContext | null> => {
  const result = await pool.query(
    `${listClientSelect}
      and c.fiteatsy_client_id = $6
      order by hp.updated_at desc nulls last
      limit 1
    `,
    [...AUTHENTICATED_USER_EXCLUSION_ROLES, PUBLISHED_REPORT_STATUSES, publicClientId]
  );

  const row = result.rows[0];
  if (!row) return null;

  const profile: ConsultantClientProfileRecord = {
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

export const listValidatedBiomarkerSummaryForClient = async (
  internalClientId: string,
  accountId: string
): Promise<ConsultantBiomarkerSummary[]> => {
  const result = await pool.query(
    `
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
    `,
    [internalClientId, accountId]
  );

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

export const listConsultantReportSummariesForClient = async (
  internalClientId: string,
  accountId: string,
  limit = 12
): Promise<ConsultantReportSummary[]> => {
  const result = await pool.query(
    `
      select
        id,
        report_type,
        original_filename,
        processing_status,
        report_date,
        lab_name,
        file_size,
        created_at,
        updated_at
      from health_reports
      where client_id = $1
        and user_id = $2
        and deleted_at is null
      order by updated_at desc, created_at desc
      limit $3
    `,
    [internalClientId, accountId, limit]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    reportType: String(row.report_type),
    originalFilename: String(row.original_filename),
    processingStatus: String(row.processing_status),
    reportDate: row.report_date == null ? null : String(row.report_date),
    labName: row.lab_name == null ? null : String(row.lab_name),
    fileSize: Number(row.file_size),
    uploadedAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  }));
};

export const getConsultantWearableSummaryForClient = async (
  internalClientId: string,
  accountId: string
): Promise<ConsultantWearableSummary> => {
  const summaryResult = await pool.query(
    `
      select
        count(*)::int as records_count,
        max(measured_at) as last_synced_at,
        array_remove(array_agg(distinct source_provider), null) as data_sources
      from health_observations
      where client_id = $1
        and user_id = $2
        and quality_status in ('accepted', 'estimated')
    `,
    [internalClientId, accountId]
  );
  const metricResult = await pool.query(
    `
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
    `,
    [internalClientId, accountId]
  );
  const summary = summaryResult.rows[0] ?? {};
  const dataSources = Array.isArray(summary.data_sources) ? summary.data_sources.map((item: unknown) => String(item)) : [];

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

export const listConsultantTimelineForClient = async (
  internalClientId: string,
  accountId: string,
  limit = 20
): Promise<ConsultantTimelineEvent[]> => {
  const result = await pool.query(
    `
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
    `,
    [internalClientId, accountId, limit]
  );

  return result.rows.map((row) => ({
    type: String(row.type),
    title: String(row.title),
    detail: String(row.detail),
    timestamp: new Date(String(row.timestamp)).toISOString(),
    source: String(row.source) as ConsultantTimelineEvent['source']
  }));
};
