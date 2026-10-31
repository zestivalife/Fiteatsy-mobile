import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export const PROFESSIONAL_TYPES = ['CONSULTANT', 'PRACTITIONER', 'MENTOR'] as const;
export type ProfessionalType = typeof PROFESSIONAL_TYPES[number];

export class ReassignmentRequiredError extends Error {
  currentAssignment: Record<string, unknown>;

  constructor(currentAssignment: Record<string, unknown>) {
    super('REASSIGNMENT_CONFIRMATION_REQUIRED');
    this.name = 'ReassignmentRequiredError';
    this.currentAssignment = currentAssignment;
  }
}

const GENERIC_PROFESSIONAL_NAMES = new Set([
  'consultant dashboard user',
  'consultant',
]);

const maskEmail = (value: unknown) => {
  const email = String(value ?? '').trim();
  const [local, domain] = email.split('@');
  if (!local || !domain) return null;
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`;
};

const maskMobile = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
};

const mapAssignmentClient = (row: Record<string, unknown>) => ({
  clientId: String(row.fiteatsy_client_id),
  userId: String(row.user_id),
  name: String(row.name),
  maskedEmail: maskEmail(row.email_normalized),
  maskedMobileNumber: maskMobile(row.mobile_number_normalized),
  status: String(row.status),
  accountPurpose: String(row.account_purpose),
  registrationDateISO: new Date(row.created_at as string).toISOString(),
  assignmentStatus: row.assignment_id ? 'ASSIGNED' : 'UNASSIGNED',
  assignedProfessional: row.consultant_user_id ? { userId: String(row.consultant_user_id), name: String(row.professional_name), role: String(row.professional_role) } : null,
  assignedToMe: Boolean(row.assigned_to_me),
  assignmentId: row.assignment_id ? String(row.assignment_id) : null,
  assignmentCreatedAtISO: row.assignment_created_at ? new Date(row.assignment_created_at as string).toISOString() : null,
  foodPreferenceStatus: String(row.food_preference_status),
  subscriptionStatus: row.subscription_status ? String(row.subscription_status) : 'NONE',
  product: 'FITEATSY',
});

const resolveProfessionalName = (row: { id?: unknown; name?: unknown; first_name?: unknown; last_name?: unknown; email_normalized?: unknown }) => {
  const firstLast = [row.first_name, row.last_name].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ');
  if (firstLast) return firstLast;
  const name = String(row.name ?? '').trim();
  if (name && !GENERIC_PROFESSIONAL_NAMES.has(name.toLowerCase())) return name;
  const email = String(row.email_normalized ?? '').trim();
  return email || `Consultant ${String(row.id ?? '').slice(0, 8)}`;
};

const mapProfessional = (row: { id?: unknown; name?: unknown; first_name?: unknown; last_name?: unknown; email_normalized?: unknown; role?: unknown; status?: unknown }) => {
  const firstName = String(row.first_name ?? '').trim() || null;
  const lastName = String(row.last_name ?? '').trim() || null;
  const displayName = resolveProfessionalName(row);
  return {
    professionalId: String(row.id),
    userId: String(row.id),
    firstName,
    lastName,
    displayName,
    name: displayName,
    email: row.email_normalized == null ? null : String(row.email_normalized),
    role: String(row.role),
    status: String(row.status ?? 'active').toUpperCase(),
    productAccess: ['FITEATSY'],
  };
};

type AssignmentActor = { actorUserId: string | null; actorReference?: string | null };

const audit = async (input: AssignmentActor & { assignmentId: string; action: string; clientUserId: string; professionalUserId: string; professionalType: ProfessionalType; relationshipType: string; reason?: string }) => {
  await pool.query(
    `insert into professional_assignment_audit_events
      (id, assignment_id, action, actor_user_id, actor_reference, client_user_id, professional_user_id, professional_type, relationship_type, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [crypto.randomUUID(), input.assignmentId, input.action, input.actorUserId, input.actorReference ?? null, input.clientUserId, input.professionalUserId, input.professionalType, input.relationshipType, input.reason ?? null]
  );
};

export const discoverClientsForAssignment = async (query: string, limit: number, offset: number) => {
  const result = await pool.query(
    `select c.fiteatsy_client_id, u.id as user_id, u.name, u.email_normalized, u.mobile_number_normalized, u.status, u.account_purpose, u.created_at,
            case when coalesce(hp.food_preference_profile, '{}'::jsonb) = '{}'::jsonb then 'NOT_PROVIDED' else 'AVAILABLE' end as food_preference_status,
            active_assignment.id as assignment_id, active_assignment.consultant_user_id,
            active_assignment.professional_name, active_assignment.professional_role,
            active_assignment.created_at as assignment_created_at,
            subscription.status as subscription_status,
            (active_assignment.consultant_user_id = $4) as assigned_to_me
       from users u
       join fiteatsy_clients c on c.account_user_id = u.id and c.deleted_at is null and lower(coalesce(c.status, '')) = 'active'
       left join lateral (
         select food_preference_profile
           from health_profiles
          where user_id = u.id and deleted_at is null
          order by updated_at desc limit 1
       ) hp on true
       left join lateral (
           select a.id, a.consultant_user_id, a.created_at, coalesce(nullif(trim(concat_ws(' ', professional.first_name, professional.last_name)), ''), professional.name) as professional_name, professional.role as professional_role
          from consultant_client_assignments a
          join users professional on professional.id = a.consultant_user_id
          where a.client_user_id = u.id and a.status = 'active' and a.product = 'FITEATSY'
          order by a.updated_at desc limit 1
       ) active_assignment on true
       left join lateral (
         select subscriptions.status
           from user_subscriptions subscriptions
          where subscriptions.user_id = u.id and subscriptions.status = 'ACTIVE'
            and subscriptions.revoked_at is null and subscriptions.starts_at <= now() and subscriptions.expires_at > now()
          order by subscriptions.expires_at desc limit 1
       ) subscription on true
      where u.deleted_at is null and lower(coalesce(u.status, '')) = 'active'
        and ($1 = '' or lower(u.name) like '%' || lower($1) || '%' or lower(coalesce(u.email_normalized, '')) like '%' || lower($1) || '%' or (regexp_replace($1, '[^0-9]', '', 'g') <> '' and regexp_replace(coalesce(u.mobile_number_normalized, ''), '[^0-9]', '', 'g') like '%' || regexp_replace($1, '[^0-9]', '', 'g') || '%'))
        and ($5 = 'all' or ($5 = 'unassigned' and active_assignment.id is null) or ($5 = 'assigned' and active_assignment.id is not null) or ($5 = 'mine' and active_assignment.consultant_user_id = $4))
      order by u.created_at desc limit $2 offset $3`,
    [query.trim(), limit, offset, null, 'all']
  );
  return result.rows.map(mapAssignmentClient);
};

export const listClientAllocationPool = async (input: { query: string; limit: number; offset: number; assignmentFilter: 'all' | 'unassigned' | 'assigned' | 'mine'; professionalUserId: string; supervisorOnly?: boolean }) => {
  const result = await pool.query(
    `select c.fiteatsy_client_id, u.id as user_id, u.name, u.email_normalized, u.mobile_number_normalized, u.status, u.account_purpose, u.created_at,
            case when coalesce(hp.food_preference_profile, '{}'::jsonb) = '{}'::jsonb then 'NOT_PROVIDED' else 'AVAILABLE' end as food_preference_status,
            active_assignment.id as assignment_id, active_assignment.consultant_user_id,
            active_assignment.professional_name, active_assignment.professional_role,
            active_assignment.created_at as assignment_created_at,
            subscription.status as subscription_status,
            (active_assignment.consultant_user_id = $4) as assigned_to_me
       from users u
       join fiteatsy_clients c on c.account_user_id = u.id and c.deleted_at is null and lower(coalesce(c.status, '')) = 'active'
       left join lateral (
         select food_preference_profile
           from health_profiles
          where user_id = u.id and deleted_at is null
          order by updated_at desc limit 1
       ) hp on true
       left join lateral (
           select a.id, a.consultant_user_id, a.created_at, coalesce(nullif(trim(concat_ws(' ', professional.first_name, professional.last_name)), ''), professional.name) as professional_name, professional.role as professional_role
          from consultant_client_assignments a
          join users professional on professional.id = a.consultant_user_id
          where a.client_user_id = u.id and a.status = 'active' and a.product = 'FITEATSY'
            and a.relationship_type = case when $6::boolean then 'DELEGATED_CLIENT_CARE' else 'CLIENT_CARE' end
          order by a.updated_at desc limit 1
       ) active_assignment on true
       left join lateral (
         select subscriptions.status
           from user_subscriptions subscriptions
          where subscriptions.user_id = u.id and subscriptions.status = 'ACTIVE'
            and subscriptions.revoked_at is null and subscriptions.starts_at <= now() and subscriptions.expires_at > now()
          order by subscriptions.expires_at desc limit 1
       ) subscription on true
      where u.deleted_at is null and lower(coalesce(u.status, '')) = 'active'
        and ($1 = '' or lower(u.name) like '%' || lower($1) || '%' or lower(coalesce(u.email_normalized, '')) like '%' || lower($1) || '%' or (regexp_replace($1, '[^0-9]', '', 'g') <> '' and regexp_replace(coalesce(u.mobile_number_normalized, ''), '[^0-9]', '', 'g') like '%' || regexp_replace($1, '[^0-9]', '', 'g') || '%'))
        and ($5 = 'all' or ($5 = 'unassigned' and active_assignment.id is null) or ($5 = 'assigned' and active_assignment.id is not null) or ($5 = 'mine' and active_assignment.consultant_user_id = $4))
        and ($6::boolean = false or exists (
          select 1 from consultant_client_assignments supervisor_assignment
           where supervisor_assignment.client_user_id = u.id
             and supervisor_assignment.consultant_user_id = $4
             and supervisor_assignment.product = 'FITEATSY'
             and supervisor_assignment.relationship_type = 'CLIENT_CARE'
             and supervisor_assignment.status = 'active'
        ))
      order by u.created_at desc limit $2 offset $3`,
    [input.query.trim(), input.limit, input.offset, input.professionalUserId, input.assignmentFilter, input.supervisorOnly === true],
  );
  return result.rows.map(mapAssignmentClient);
};

export const discoverProfessionalsForAssignment = async (professionalType?: ProfessionalType, internalDeliveryOnly = false) => {
  const result = await pool.query(
    `select id, name, first_name, last_name, email_normalized, role, status from users
      where deleted_at is null and lower(coalesce(status, '')) = 'active'
        and lower(coalesce(role, '')) in ('consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor')
        and ($1::text is null or upper(case when lower(role) in ('provider', 'dietician', 'senior_consultant') then 'CONSULTANT' else role end) = $1)
        and ($2::boolean = false or (left(id, 4) <> 'ext_' and lower(role) in ('consultant', 'provider', 'dietician')))
      order by name asc`,
    [professionalType ?? null, internalDeliveryOnly]
  );
  return result.rows.map(mapProfessional);
};

export const createSeniorDelegatedAssignmentsBatch = async (input: AssignmentActor & {
  clientUserIds: string[];
  professionalUserId: string;
  reason?: string;
  allowReassignment?: boolean;
}) => {
  if (!input.actorUserId || input.professionalUserId.startsWith('ext_')) return null;
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    const target = await connection.query(
      `select id from users
        where id = $1 and deleted_at is null and lower(coalesce(status, '')) = 'active'
          and lower(coalesce(role, '')) in ('consultant', 'provider', 'dietician')`,
      [input.professionalUserId],
    );
    if (!target.rowCount) { await connection.query('rollback'); return null; }

    const eligible = await connection.query(
      `select client.id, fc.tenant_id
         from users client
         join fiteatsy_clients fc on fc.account_user_id = client.id
          and fc.deleted_at is null and lower(coalesce(fc.status, '')) = 'active'
         join consultant_client_assignments supervisor
          on supervisor.client_user_id = client.id
         and supervisor.consultant_user_id = $2
         and supervisor.product = 'FITEATSY'
         and supervisor.relationship_type = 'CLIENT_CARE'
         and supervisor.status = 'active'
         join tenant_memberships target_membership
          on target_membership.user_id = $3
         and target_membership.tenant_id = fc.tenant_id
         and lower(coalesce(target_membership.status, '')) = 'active'
         and lower(coalesce(target_membership.tenant_role, '')) in ('consultant', 'provider', 'dietician')
        where client.id = any($1::text[]) and client.deleted_at is null
          and lower(coalesce(client.status, '')) = 'active'`,
      [input.clientUserIds, input.actorUserId, input.professionalUserId],
    );
    if (eligible.rowCount !== input.clientUserIds.length) { await connection.query('rollback'); return null; }
    const tenantByClient = new Map<string, string>(
      eligible.rows.map((row) => [String(row.id), String(row.tenant_id)]),
    );

    const existing = await connection.query(
      `select * from consultant_client_assignments
        where client_user_id = any($1::text[]) and product = 'FITEATSY'
          and relationship_type = 'DELEGATED_CLIENT_CARE' and status = 'active'
        order by client_user_id, updated_at desc for update`,
      [input.clientUserIds],
    );
    const existingByClient = new Map<string, Record<string, unknown>>();
    for (const row of existing.rows as Record<string, unknown>[]) {
      if (!existingByClient.has(String(row.client_user_id))) existingByClient.set(String(row.client_user_id), row);
    }
    const conflicts = input.clientUserIds
      .map((clientUserId) => existingByClient.get(clientUserId))
      .filter((row): row is Record<string, unknown> => row !== undefined && String(row.consultant_user_id) !== input.professionalUserId);
    if (conflicts.length && !input.allowReassignment) throw new ReassignmentRequiredError({ conflicts });

    const assignments: Record<string, unknown>[] = [];
    for (const clientUserId of input.clientUserIds) {
      const current = existingByClient.get(clientUserId);
      if (current && String(current.consultant_user_id) === input.professionalUserId) {
        assignments.push(current);
        continue;
      }
      if (current) {
        const revoked = await connection.query(
          `update consultant_client_assignments
              set status='revoked', ends_at=now(), revoked_at=now(), revoked_by_user_id=$2, updated_at=now()
            where id=$1 and status='active' returning *`,
          [current.id, input.actorUserId],
        );
        for (const row of revoked.rows) {
          await connection.query(
            `insert into professional_assignment_audit_events
              (id, assignment_id, action, actor_user_id, client_user_id, professional_user_id, professional_type, relationship_type, reason)
             values ($1,$2,'REASSIGNED',$3,$4,$5,'CONSULTANT','DELEGATED_CLIENT_CARE',$6)`,
            [crypto.randomUUID(), row.id, input.actorUserId, clientUserId, row.consultant_user_id, input.reason ?? 'Senior Consultant reassigned delivery'],
          );
        }
      }
      const assignmentId = crypto.randomUUID();
      const created = await connection.query(
        `insert into consultant_client_assignments
          (id, tenant_id, consultant_user_id, client_user_id, created_by_user_id, product, professional_type, relationship_type)
         values ($1,$5,$2,$3,$4,'FITEATSY','CONSULTANT','DELEGATED_CLIENT_CARE') returning *`,
        [assignmentId, input.professionalUserId, clientUserId, input.actorUserId, tenantByClient.get(clientUserId)],
      );
      await connection.query(
        `insert into professional_assignment_audit_events
          (id, assignment_id, action, actor_user_id, client_user_id, professional_user_id, professional_type, relationship_type, reason)
         values ($1,$2,'DELEGATED',$3,$4,$5,'CONSULTANT','DELEGATED_CLIENT_CARE',$6)`,
        [crypto.randomUUID(), assignmentId, input.actorUserId, clientUserId, input.professionalUserId, input.reason ?? null],
      );
      assignments.push(created.rows[0] as Record<string, unknown>);
    }
    await connection.query('commit');
    return assignments;
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally {
    connection.release();
  }
};

export const createSeniorDelegatedAssignment = async (input: AssignmentActor & {
  clientUserId: string;
  professionalUserId: string;
  reason?: string;
  allowReassignment?: boolean;
}) => {
  const rows = await createSeniorDelegatedAssignmentsBatch({
    ...input,
    clientUserIds: [input.clientUserId],
  });
  return rows?.[0] ?? null;
};

export const revokeSeniorDelegatedAssignment = async (assignmentId: string, seniorUserId: string, reason?: string) => {
  const result = await pool.query(
    `update consultant_client_assignments delegated
        set status='revoked', ends_at=now(), revoked_at=now(), revoked_by_user_id=$2, updated_at=now()
      where delegated.id=$1 and delegated.product='FITEATSY'
        and delegated.relationship_type='DELEGATED_CLIENT_CARE' and delegated.status='active'
        and exists (
          select 1 from consultant_client_assignments supervisor
           where supervisor.client_user_id=delegated.client_user_id
             and supervisor.consultant_user_id=$2
             and supervisor.product='FITEATSY'
             and supervisor.relationship_type='CLIENT_CARE'
             and supervisor.status='active'
        ) returning delegated.*`,
    [assignmentId, seniorUserId],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  await audit({ assignmentId, action: 'DELEGATION_REVOKED', actorUserId: seniorUserId, clientUserId: String(row.client_user_id), professionalUserId: String(row.consultant_user_id), professionalType: 'CONSULTANT', relationshipType: 'DELEGATED_CLIENT_CARE', reason });
  return row;
};

export const createProfessionalAssignment = async (input: AssignmentActor & { clientUserId: string; professionalUserId: string; professionalType: ProfessionalType; relationshipType: string; reason?: string; allowReassignment?: boolean }) => {
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    const current = await connection.query(
      `select * from consultant_client_assignments
        where client_user_id = $1 and product = 'FITEATSY' and status = 'active'
        order by updated_at desc limit 1 for update`,
      [input.clientUserId],
    );
    const activeAssignment = current.rows[0] as Record<string, unknown> | undefined;
    if (activeAssignment && String(activeAssignment.consultant_user_id) === input.professionalUserId) {
      await connection.query('commit');
      return activeAssignment;
    }
    if (activeAssignment && !input.allowReassignment) {
      await connection.query('rollback');
      throw new ReassignmentRequiredError(activeAssignment);
    }
    const previous = await connection.query(
      `update consultant_client_assignments
          set status = 'revoked', ends_at = now(), revoked_at = now(), revoked_by_user_id = $2, revoked_by_actor_reference = $3, updated_at = now()
        where client_user_id = $1 and product = 'FITEATSY' and status = 'active'
        returning *`,
      [input.clientUserId, input.actorUserId, input.actorReference ?? null],
    );
    for (const row of previous.rows) {
      await connection.query(
        `insert into professional_assignment_audit_events
          (id, assignment_id, action, actor_user_id, actor_reference, client_user_id, professional_user_id, professional_type, relationship_type, reason)
         values ($1, $2, 'REASSIGNED', $3, $4, $5, $6, $7, $8, $9)`,
        [crypto.randomUUID(), row.id, input.actorUserId, input.actorReference ?? null, input.clientUserId, row.consultant_user_id, row.professional_type, row.relationship_type, input.reason ?? 'Client reassigned'],
      );
    }
    const result = await connection.query(
    `insert into consultant_client_assignments
      (id, tenant_id, consultant_user_id, client_user_id, created_by_user_id, created_by_actor_reference, product, professional_type, relationship_type)
     select $1, fc.tenant_id, professional.id, client.id, $2, $7, 'FITEATSY', $4, $5
       from users professional join users client on client.id = $3
       join fiteatsy_clients fc on fc.account_user_id = client.id and fc.deleted_at is null and lower(coalesce(fc.status, '')) = 'active'
       join tenant_memberships professional_membership
         on professional_membership.user_id = professional.id
        and professional_membership.tenant_id = fc.tenant_id
        and lower(coalesce(professional_membership.status, '')) = 'active'
      where professional.id = $6 and professional.deleted_at is null and client.deleted_at is null
        and lower(coalesce(professional.status, '')) = 'active'
        and lower(coalesce(client.status, '')) = 'active'
        and lower(coalesce(professional.role, '')) in ('consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor')
     on conflict (consultant_user_id, client_user_id, scope) where status = 'active'
     do update set updated_at = now()
     returning *`,
      [crypto.randomUUID(), input.actorUserId, input.clientUserId, input.professionalType, input.relationshipType, input.professionalUserId, input.actorReference ?? null]
    );
    if (!result.rowCount) { await connection.query('rollback'); return null; }
  const row = result.rows[0];
    await connection.query(
      `insert into professional_assignment_audit_events
        (id, assignment_id, action, actor_user_id, actor_reference, client_user_id, professional_user_id, professional_type, relationship_type, reason)
       values ($1, $2, 'CREATED', $3, $4, $5, $6, $7, $8, $9)`,
      [crypto.randomUUID(), row.id, input.actorUserId, input.actorReference ?? null, input.clientUserId, input.professionalUserId, input.professionalType, input.relationshipType, input.reason ?? null],
    );
    await connection.query('commit');
    return row;
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally {
    connection.release();
  }
};

export const createProfessionalAssignmentsBatch = async (input: AssignmentActor & { clientUserIds: string[]; professionalUserId: string; professionalType: ProfessionalType; relationshipType: string; reason?: string; allowReassignment?: boolean }) => {
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    const professional = await connection.query(
      `select id from users
        where id = $1 and deleted_at is null and lower(coalesce(status, '')) = 'active'
          and lower(coalesce(role, '')) in ('consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor')`,
      [input.professionalUserId],
    );
    if (!professional.rowCount) {
      await connection.query('rollback');
      return null;
    }
    const eligibleClients = await connection.query(
      `select client.id, fc.tenant_id
         from users client
         join fiteatsy_clients fc on fc.account_user_id = client.id
          and fc.deleted_at is null and lower(coalesce(fc.status, '')) = 'active'
         join tenant_memberships professional_membership
           on professional_membership.user_id = $2
          and professional_membership.tenant_id = fc.tenant_id
          and lower(coalesce(professional_membership.status, '')) = 'active'
        where client.id = any($1::text[]) and client.deleted_at is null
          and lower(coalesce(client.status, '')) = 'active'`,
      [input.clientUserIds, input.professionalUserId],
    );
    if (eligibleClients.rowCount !== input.clientUserIds.length) {
      await connection.query('rollback');
      return null;
    }
    const tenantByClient = new Map<string, string>(
      eligibleClients.rows.map((row) => [String(row.id), String(row.tenant_id)]),
    );
    const current = await connection.query(
      `select * from consultant_client_assignments
        where client_user_id = any($1::text[]) and product = 'FITEATSY' and status = 'active'
        order by client_user_id, updated_at desc for update`,
      [input.clientUserIds],
    );
    const currentByClient = new Map<string, Record<string, unknown>>();
    for (const row of current.rows as Record<string, unknown>[]) {
      const clientUserId = String(row.client_user_id);
      if (!currentByClient.has(clientUserId)) currentByClient.set(clientUserId, row);
    }
    const conflicts = input.clientUserIds
      .map((clientUserId) => currentByClient.get(clientUserId))
      .filter((row): row is Record<string, unknown> => Boolean(row) && String(row?.consultant_user_id) !== input.professionalUserId);
    if (conflicts.length && !input.allowReassignment) {
      throw new ReassignmentRequiredError({ conflicts });
    }

    const assignments: Record<string, unknown>[] = [];
    for (const clientUserId of input.clientUserIds) {
      const activeAssignment = currentByClient.get(clientUserId);
      if (activeAssignment && String(activeAssignment.consultant_user_id) === input.professionalUserId) {
        assignments.push(activeAssignment);
        continue;
      }
      if (activeAssignment) {
        const previous = await connection.query(
          `update consultant_client_assignments
              set status = 'revoked', ends_at = now(), revoked_at = now(), revoked_by_user_id = $2, revoked_by_actor_reference = $3, updated_at = now()
            where client_user_id = $1 and product = 'FITEATSY' and status = 'active'
            returning *`,
          [clientUserId, input.actorUserId, input.actorReference ?? null],
        );
        for (const row of previous.rows) {
          await connection.query(
            `insert into professional_assignment_audit_events
              (id, assignment_id, action, actor_user_id, actor_reference, client_user_id, professional_user_id, professional_type, relationship_type, reason)
             values ($1, $2, 'REASSIGNED', $3, $4, $5, $6, $7, $8, $9)`,
            [crypto.randomUUID(), row.id, input.actorUserId, input.actorReference ?? null, clientUserId, row.consultant_user_id, row.professional_type, row.relationship_type, input.reason ?? 'Client reassigned'],
          );
        }
      }
      const assignmentId = crypto.randomUUID();
      const created = await connection.query(
        `insert into consultant_client_assignments
          (id, tenant_id, consultant_user_id, client_user_id, created_by_user_id, created_by_actor_reference, product, professional_type, relationship_type)
         values ($1, $8, $2, $3, $4, $7, 'FITEATSY', $5, $6)
         returning *`,
        [assignmentId, input.professionalUserId, clientUserId, input.actorUserId, input.professionalType, input.relationshipType, input.actorReference ?? null, tenantByClient.get(clientUserId)],
      );
      const row = created.rows[0] as Record<string, unknown>;
      await connection.query(
        `insert into professional_assignment_audit_events
          (id, assignment_id, action, actor_user_id, actor_reference, client_user_id, professional_user_id, professional_type, relationship_type, reason)
         values ($1, $2, 'CREATED', $3, $4, $5, $6, $7, $8, $9)`,
        [crypto.randomUUID(), assignmentId, input.actorUserId, input.actorReference ?? null, clientUserId, input.professionalUserId, input.professionalType, input.relationshipType, input.reason ?? null],
      );
      assignments.push(row);
    }
    await connection.query('commit');
    return assignments;
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally {
    connection.release();
  }
};

export const listProfessionalAssignments = async (professionalUserId?: string, includeSupervisedDelegations = false) => {
  const result = await pool.query(
    `select a.*, c.fiteatsy_client_id, client.name as client_name, professional.name as professional_name
       from consultant_client_assignments a
       join users client on client.id = a.client_user_id
       join users professional on professional.id = a.consultant_user_id
       join fiteatsy_clients c on c.account_user_id = client.id
      where a.product = 'FITEATSY' and (
        $1::text is null
        or a.consultant_user_id = $1
        or ($2::boolean = true and a.relationship_type = 'DELEGATED_CLIENT_CARE' and exists (
          select 1 from consultant_client_assignments supervisor
           where supervisor.client_user_id = a.client_user_id
             and supervisor.consultant_user_id = $1
             and supervisor.product = 'FITEATSY'
             and supervisor.relationship_type = 'CLIENT_CARE'
             and supervisor.status = 'active'
        ))
      )
      order by a.updated_at desc`,
    [professionalUserId ?? null, includeSupervisedDelegations]
  );
  return result.rows;
};

export const revokeProfessionalAssignment = async (assignmentId: string, actorUserId: string | null, reason?: string, actorReference?: string | null) => {
  const result = await pool.query(`update consultant_client_assignments set status = 'revoked', ends_at = now(), revoked_at = now(), revoked_by_user_id = $2, revoked_by_actor_reference = $3, updated_at = now() where id = $1 and product = 'FITEATSY' and status = 'active' returning *`, [assignmentId, actorUserId, actorReference ?? null]);
  if (!result.rowCount) return null;
  const row = result.rows[0];
  await audit({ assignmentId, action: 'REVOKED', actorUserId, actorReference, clientUserId: String(row.client_user_id), professionalUserId: String(row.consultant_user_id), professionalType: String(row.professional_type) as ProfessionalType, relationshipType: String(row.relationship_type), reason });
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
    reason: 'Legacy relationship synchronized into CAP-003',
    allowReassignment: true,
  });
  return assignment;
};
