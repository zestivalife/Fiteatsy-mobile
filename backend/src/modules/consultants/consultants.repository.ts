import { pool } from '../../db/pool.js';

export type ConsultantClientListRecord = {
  clientId: string;
  name: string;
  age: number | null;
  gender: string | null;
  profileCompleted: boolean;
  registeredAt: string;
  lastActiveAt: string | null;
};

export type ConsultantClientProfileRecord = {
  client: {
    id: string;
    name: string;
    dob: string | null;
    gender: string | null;
  };
  onboarding: {
    height: number | null;
    weight: number | null;
    goal: string | null;
    activityLevel: string | null;
    dietPreference: string | null;
    medicalConditions: string[];
  };
};

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

const profileCompleted = (row: Record<string, unknown>) =>
  Boolean(row.health_profile_id) &&
  Boolean(row.gender) &&
  (row.calculated_age != null || row.date_of_birth_iso != null) &&
  row.height_cm != null &&
  row.current_weight_kg != null;

const realClientPredicate = `
  c.deleted_at is null
  and u.deleted_at is null
  and u.status = 'active'
  and c.status = 'active'
  and coalesce(u.role, 'user') not in ('consultant', 'practitioner', 'admin', 'super_admin')
`;

export const listRegisteredConsultantClients = async (): Promise<ConsultantClientListRecord[]> => {
  const result = await pool.query(
    `
      select
        c.fiteatsy_client_id,
        u.name,
        hp.id as health_profile_id,
        hp.calculated_age,
        hp.date_of_birth_iso,
        hp.gender,
        hp.height_cm,
        hp.current_weight_kg,
        greatest(
          u.last_login_at,
          max(coalesce(s.last_used_at, s.created_at))
        ) as last_active_at,
        u.created_at as registered_at
      from fiteatsy_clients c
      join users u on u.id = c.account_user_id
      left join health_profiles hp
        on hp.client_id = c.id
        and hp.user_id = u.id
        and hp.deleted_at is null
        and hp.status = 'active'
      left join auth_sessions s on s.user_id = u.id
      where ${realClientPredicate}
      group by
        c.fiteatsy_client_id,
        u.name,
        u.created_at,
        u.last_login_at,
        hp.id,
        hp.calculated_age,
        hp.date_of_birth_iso,
        hp.gender,
        hp.height_cm,
        hp.current_weight_kg
      order by u.created_at desc
    `
  );

  return result.rows.map((row) => ({
    clientId: String(row.fiteatsy_client_id),
    name: String(row.name),
    age: toNumberOrNull(row.calculated_age),
    gender: row.gender == null ? null : String(row.gender),
    profileCompleted: profileCompleted(row),
    registeredAt: new Date(String(row.registered_at)).toISOString(),
    lastActiveAt: toIso(row.last_active_at)
  }));
};

export const getRegisteredConsultantClientProfile = async (
  publicClientId: string
): Promise<ConsultantClientProfileRecord | null> => {
  const result = await pool.query(
    `
      select
        c.fiteatsy_client_id,
        u.name,
        hp.date_of_birth_iso,
        hp.gender,
        hp.height_cm,
        hp.current_weight_kg,
        hp.wellness_goals,
        hp.activity_level,
        hp.diet_type,
        hp.primary_conditions
      from fiteatsy_clients c
      join users u on u.id = c.account_user_id
      left join health_profiles hp
        on hp.client_id = c.id
        and hp.user_id = u.id
        and hp.deleted_at is null
        and hp.status = 'active'
      where ${realClientPredicate}
        and c.fiteatsy_client_id = $1
      order by hp.updated_at desc nulls last
      limit 1
    `,
    [publicClientId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    client: {
      id: String(row.fiteatsy_client_id),
      name: String(row.name),
      dob: toIso(row.date_of_birth_iso),
      gender: row.gender == null ? null : String(row.gender)
    },
    onboarding: {
      height: toNumberOrNull(row.height_cm),
      weight: toNumberOrNull(row.current_weight_kg),
      goal: firstString(row.wellness_goals),
      activityLevel: row.activity_level == null ? null : String(row.activity_level),
      dietPreference: row.diet_type == null ? null : String(row.diet_type),
      medicalConditions: toStringArray(row.primary_conditions)
    }
  };
};
