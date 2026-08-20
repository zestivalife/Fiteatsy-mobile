import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export const PROFESSIONAL_TYPES = ['CONSULTANT', 'PRACTITIONER', 'MENTOR'] as const;
export type ProfessionalType = typeof PROFESSIONAL_TYPES[number];

const audit = async (input: { assignmentId: string; action: string; actorUserId: string; clientUserId: string; professionalUserId: string; professionalType: ProfessionalType; relationshipType: string; reason?: string }) => {
  await pool.query(
    `insert into professional_assignment_audit_events
      (id, assignment_id, action, actor_user_id, client_user_id, professional_user_id, professional_type, relationship_type, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [crypto.randomUUID(), input.assignmentId, input.action, input.actorUserId, input.clientUserId, input.professionalUserId, input.professionalType, input.relationshipType, input.reason ?? null]
  );
};

export const discoverClientsForAssignment = async (query: string, limit: number, offset: number) => {
  const result = await pool.query(
    `select c.fiteatsy_client_id, u.id as user_id, u.name, u.status, u.account_purpose,
            exists (select 1 from consultant_client_assignments a where a.client_user_id = u.id and a.status = 'active' and a.product = 'FITEATSY') as assigned
       from users u
       join fiteatsy_clients c on c.account_user_id = u.id and c.deleted_at is null and lower(coalesce(c.status, '')) = 'active'
      where u.deleted_at is null and lower(coalesce(u.status, '')) = 'active' and lower(coalesce(u.role, 'user')) = 'user'
        and ($1 = '' or lower(u.name) like '%' || lower($1) || '%' or lower(coalesce(u.email_normalized, '')) like '%' || lower($1) || '%')
      order by u.created_at desc limit $2 offset $3`,
    [query.trim(), limit, offset]
  );
  return result.rows.map((row) => ({ clientId: String(row.fiteatsy_client_id), userId: String(row.user_id), name: String(row.name), status: String(row.status), accountPurpose: String(row.account_purpose), assignmentStatus: row.assigned ? 'ASSIGNED' : 'UNASSIGNED', product: 'FITEATSY' }));
};

export const createProfessionalAssignment = async (input: { actorUserId: string; clientUserId: string; professionalUserId: string; professionalType: ProfessionalType; relationshipType: string; reason?: string }) => {
  const result = await pool.query(
    `insert into consultant_client_assignments
      (id, consultant_user_id, client_user_id, created_by_user_id, product, professional_type, relationship_type)
     select $1, professional.id, client.id, $2, 'FITEATSY', $4, $5
       from users professional join users client on client.id = $3
       join fiteatsy_clients fc on fc.account_user_id = client.id and fc.deleted_at is null and lower(coalesce(fc.status, '')) = 'active'
      where professional.id = $6 and professional.deleted_at is null and client.deleted_at is null
        and lower(coalesce(professional.status, '')) = 'active'
        and lower(coalesce(professional.role, '')) in ('consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor')
        and lower(coalesce(client.role, 'user')) = 'user'
     on conflict (consultant_user_id, client_user_id, scope) where status = 'active'
     do update set updated_at = now()
     returning *`,
    [crypto.randomUUID(), input.actorUserId, input.clientUserId, input.professionalType, input.relationshipType, input.professionalUserId]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  await audit({ assignmentId: String(row.id), action: 'CREATED', ...input, professionalType: input.professionalType, relationshipType: input.relationshipType, actorUserId: input.actorUserId });
  return row;
};

export const listProfessionalAssignments = async (professionalUserId?: string) => {
  const result = await pool.query(
    `select a.*, c.fiteatsy_client_id, client.name as client_name, professional.name as professional_name
       from consultant_client_assignments a
       join users client on client.id = a.client_user_id
       join users professional on professional.id = a.consultant_user_id
       join fiteatsy_clients c on c.account_user_id = client.id
      where a.product = 'FITEATSY' and ($1::text is null or a.consultant_user_id = $1)
      order by a.updated_at desc`,
    [professionalUserId ?? null]
  );
  return result.rows;
};

export const revokeProfessionalAssignment = async (assignmentId: string, actorUserId: string, reason?: string) => {
  const result = await pool.query(`update consultant_client_assignments set status = 'revoked', ends_at = now(), revoked_at = now(), revoked_by_user_id = $2, updated_at = now() where id = $1 and product = 'FITEATSY' and status = 'active' returning *`, [assignmentId, actorUserId]);
  if (!result.rowCount) return null;
  const row = result.rows[0];
  await audit({ assignmentId, action: 'REVOKED', actorUserId, clientUserId: String(row.client_user_id), professionalUserId: String(row.consultant_user_id), professionalType: String(row.professional_type) as ProfessionalType, relationshipType: String(row.relationship_type), reason });
  return row;
};

export const syncLegacyProfessionalAssignment = async (input: { clientUserId: string; professionalUserId: string | null; professionalType: ProfessionalType; actorUserId: string }) => {
  if (!input.professionalUserId) return;
  const assignment = await createProfessionalAssignment({
    actorUserId: input.actorUserId,
    clientUserId: input.clientUserId,
    professionalUserId: input.professionalUserId,
    professionalType: input.professionalType,
    relationshipType: input.professionalType === 'MENTOR' ? 'MENTORSHIP' : 'CLIENT_CARE',
    reason: 'Legacy relationship synchronized into CAP-003'
  });
  return assignment;
};
