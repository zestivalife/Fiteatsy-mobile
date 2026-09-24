import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export const CONSULTANT_ACCESS_POLICY_VERSION = 'CONSULTANT_ACCESS_V1';
export const CONSULTANT_ACCESS_PRODUCT = 'FITEATSY';
const SUPPORTED_CONSULTANT_ROLES_SQL = "('consultant','provider','dietician','senior_consultant')";
export const CONSULTANT_ACCESS_DATA_CATEGORIES = [
  'Health profile and Health Intelligence',
  'Nutrition plans and food preferences',
  'Health reports and biomarkers',
  'Activity and wearable summaries',
] as const;

export type ConsultantAccessStatus = 'GRANTED' | 'REVOKED' | 'PENDING' | 'NOT_REQUESTED';

export const consultantAccessSqlPredicate = (assignment: string, consent: string) => `
  ${assignment}.product = '${CONSULTANT_ACCESS_PRODUCT}'
  and ${assignment}.status = 'active'
  and (${assignment}.ends_at is null or ${assignment}.ends_at > now())
  and ${consent}.assignment_id = ${assignment}.id
  and ${consent}.consultant_user_id = ${assignment}.consultant_user_id
  and ${consent}.user_id = ${assignment}.client_user_id
  and ${consent}.product = ${assignment}.product
  and ${consent}.status = 'GRANTED'
  and ${consent}.policy_version = '${CONSULTANT_ACCESS_POLICY_VERSION}'
`;

const mapRequest = (row: any) => ({
  assignmentId: String(row.assignment_id),
  consultantUserId: String(row.consultant_user_id),
  consultantName: String(row.consultant_name),
  consultantRole: String(row.consultant_role),
  professionalType: String(row.professional_type),
  relationshipType: String(row.relationship_type),
  purpose: row.relationship_type === 'MENTORSHIP' ? 'Wellness mentorship and progress support' : 'Personalised clinical, nutrition, and wellness support',
  dataCategories: [...CONSULTANT_ACCESS_DATA_CATEGORIES],
  status: String(row.status ?? 'NOT_REQUESTED') as ConsultantAccessStatus,
  policyVersion: String(row.policy_version ?? CONSULTANT_ACCESS_POLICY_VERSION),
  grantedAt: row.granted_at?.toISOString?.() ?? null,
  revokedAt: row.revoked_at?.toISOString?.() ?? null,
  version: Number(row.version ?? 0),
  updatedAt: row.updated_at?.toISOString?.() ?? null,
});

export const listConsultantAccessRequests = async (clientUserId: string) => {
  const result = await pool.query(
    `select assignment.id as assignment_id, assignment.consultant_user_id,
            coalesce(nullif(trim(concat_ws(' ', professional.first_name, professional.last_name)), ''), professional.name) as consultant_name,
            professional.role as consultant_role, assignment.professional_type, assignment.relationship_type,
            consent.status, consent.policy_version, consent.granted_at, consent.revoked_at,
            consent.version, consent.updated_at
       from consultant_client_assignments assignment
       join users professional on professional.id = assignment.consultant_user_id
       left join consultant_access_consents consent
         on consent.assignment_id = assignment.id
        and consent.consultant_user_id = assignment.consultant_user_id
        and consent.user_id = assignment.client_user_id
        and consent.product = assignment.product
        and consent.policy_version = $2
      where assignment.client_user_id = $1
        and assignment.product = $3
        and assignment.status = 'active'
        and (assignment.ends_at is null or assignment.ends_at > now())
        and professional.deleted_at is null
        and lower(coalesce(professional.status, '')) = 'active'
        and lower(coalesce(professional.role, '')) in ${SUPPORTED_CONSULTANT_ROLES_SQL}
        and assignment.professional_type = 'CONSULTANT'
      order by assignment.created_at desc`,
    [clientUserId, CONSULTANT_ACCESS_POLICY_VERSION, CONSULTANT_ACCESS_PRODUCT],
  );
  return result.rows.map(mapRequest);
};

export const setConsultantAccessDecision = async (input: {
  clientUserId: string;
  internalClientId: string;
  assignmentId: string;
  status: 'GRANTED' | 'REVOKED';
  source: string;
  policyVersion: string;
}) => {
  const db = await pool.connect();
  try {
    await db.query('begin');
    const assignment = await db.query(
      `select assignment.*, professional.deleted_at as professional_deleted_at, professional.status as professional_status,
              professional.role as professional_role
         from consultant_client_assignments assignment
         join users professional on professional.id = assignment.consultant_user_id
        where assignment.id = $1 and assignment.client_user_id = $2
          and assignment.product = $3 and assignment.status = 'active'
          and (assignment.ends_at is null or assignment.ends_at > now())
        for update of assignment`,
      [input.assignmentId, input.clientUserId, CONSULTANT_ACCESS_PRODUCT],
    );
    const relationship = assignment.rows[0];
    if (!relationship || relationship.professional_deleted_at ||
        String(relationship.professional_status).toLowerCase() !== 'active' ||
        !['consultant', 'provider', 'dietician', 'senior_consultant'].includes(String(relationship.professional_role).toLowerCase()) ||
        String(relationship.professional_type) !== 'CONSULTANT') {
      await db.query('rollback');
      return null;
    }
    const saved = await db.query(
      `insert into consultant_access_consents
        (user_id, client_id, assignment_id, consultant_user_id, product, status, policy_version, source, granted_at, revoked_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,case when $6='GRANTED' then now() end,case when $6='REVOKED' then now() end)
       on conflict (assignment_id, policy_version) where assignment_id is not null
       do update set status=excluded.status, source=excluded.source,
         granted_at=case when excluded.status='GRANTED' then now() else consultant_access_consents.granted_at end,
         revoked_at=case when excluded.status='REVOKED' then now() else null end,
         version=consultant_access_consents.version+1, updated_at=now()
       returning *`,
      [input.clientUserId, input.internalClientId, input.assignmentId, relationship.consultant_user_id, CONSULTANT_ACCESS_PRODUCT, input.status, input.policyVersion, input.source],
    );
    await db.query(
      `insert into consultant_access_consent_events
        (id, assignment_id, client_user_id, consultant_user_id, product, policy_version, status, source, actor_user_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$3)`,
      [crypto.randomUUID(), input.assignmentId, input.clientUserId, relationship.consultant_user_id, CONSULTANT_ACCESS_PRODUCT, input.policyVersion, input.status, input.source],
    );
    await db.query('commit');
    const requests = await listConsultantAccessRequests(input.clientUserId);
    return requests.find((request) => request.assignmentId === input.assignmentId) ?? null;
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
};

export const resolveConsultantClientAccess = async (professionalUserId: string, publicClientId: string) => {
  const result = await pool.query(
    `select assignment.id as assignment_id
       from consultant_client_assignments assignment
       join users professional on professional.id = assignment.consultant_user_id
       join fiteatsy_clients client on client.account_user_id = assignment.client_user_id
       join consultant_access_consents consent on ${consultantAccessSqlPredicate('assignment', 'consent')}
      where assignment.consultant_user_id = $1
        and client.fiteatsy_client_id = $2
        and client.deleted_at is null and lower(coalesce(client.status, '')) = 'active'
        and professional.deleted_at is null and lower(coalesce(professional.status, '')) = 'active'
        and lower(coalesce(professional.role, '')) in ${SUPPORTED_CONSULTANT_ROLES_SQL}
        and assignment.professional_type = 'CONSULTANT'
      limit 1`,
    [professionalUserId, publicClientId],
  );
  return result.rows[0] ? { authorized: true as const, assignmentId: String(result.rows[0].assignment_id) } : { authorized: false as const };
};

export const getConsultantAccessReconciliation = async () => {
  const result = await pool.query(
    `select count(*)::int as active_assignments,
            count(*) filter (where current_consent.status = 'GRANTED')::int as authorized,
            count(*) filter (where current_consent.assignment_id is null or current_consent.status in ('PENDING','NOT_REQUESTED'))::int as awaiting_decision,
            count(*) filter (where current_consent.status = 'REVOKED')::int as revoked,
            count(*) filter (where current_consent.assignment_id is null and exists (
              select 1 from consultant_access_consents historical
               where historical.assignment_id = assignment.id and historical.policy_version <> $1
            ))::int as stale_policy
       from consultant_client_assignments assignment
       join users professional on professional.id = assignment.consultant_user_id
       left join consultant_access_consents current_consent
         on current_consent.assignment_id = assignment.id
        and current_consent.consultant_user_id = assignment.consultant_user_id
        and current_consent.user_id = assignment.client_user_id
        and current_consent.product = assignment.product
        and current_consent.policy_version = $1
      where assignment.product = $2 and assignment.status = 'active'
        and (assignment.ends_at is null or assignment.ends_at > now())
        and assignment.professional_type = 'CONSULTANT'
        and professional.deleted_at is null and lower(coalesce(professional.status, '')) = 'active'
        and lower(coalesce(professional.role, '')) in ${SUPPORTED_CONSULTANT_ROLES_SQL}`,
    [CONSULTANT_ACCESS_POLICY_VERSION, CONSULTANT_ACCESS_PRODUCT],
  );
  const row = result.rows[0];
  return {
    policyVersion: CONSULTANT_ACCESS_POLICY_VERSION,
    activeAssignments: Number(row.active_assignments),
    authorized: Number(row.authorized),
    awaitingDecision: Number(row.awaiting_decision),
    revoked: Number(row.revoked),
    stalePolicy: Number(row.stale_policy),
    suspiciousZeroRoster: Number(row.authorized) === 0 && Number(row.active_assignments) > 0,
  };
};
