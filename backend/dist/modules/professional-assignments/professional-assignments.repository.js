import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
export const PROFESSIONAL_TYPES = ['CONSULTANT', 'PRACTITIONER', 'MENTOR'];
const GENERIC_PROFESSIONAL_NAMES = new Set([
    'consultant dashboard user',
    'consultant',
]);
const resolveProfessionalName = (row) => {
    const firstLast = [row.first_name, row.last_name].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ');
    if (firstLast)
        return firstLast;
    const name = String(row.name ?? '').trim();
    if (name && !GENERIC_PROFESSIONAL_NAMES.has(name.toLowerCase()))
        return name;
    const email = String(row.email_normalized ?? '').trim();
    return email || `Consultant ${String(row.id ?? '').slice(0, 8)}`;
};
const mapProfessional = (row) => {
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
const audit = async (input) => {
    await pool.query(`insert into professional_assignment_audit_events
      (id, assignment_id, action, actor_user_id, client_user_id, professional_user_id, professional_type, relationship_type, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [crypto.randomUUID(), input.assignmentId, input.action, input.actorUserId, input.clientUserId, input.professionalUserId, input.professionalType, input.relationshipType, input.reason ?? null]);
};
export const discoverClientsForAssignment = async (query, limit, offset) => {
    const result = await pool.query(`select c.fiteatsy_client_id, u.id as user_id, u.name, u.status, u.account_purpose, u.created_at,
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
        and ($1 = '' or lower(u.name) like '%' || lower($1) || '%' or lower(coalesce(u.email_normalized, '')) like '%' || lower($1) || '%')
        and ($5 = 'all' or ($5 = 'unassigned' and active_assignment.id is null) or ($5 = 'assigned' and active_assignment.id is not null) or ($5 = 'mine' and active_assignment.consultant_user_id = $4))
      order by u.created_at desc limit $2 offset $3`, [query.trim(), limit, offset, null, 'all']);
    return result.rows.map((row) => ({ clientId: String(row.fiteatsy_client_id), userId: String(row.user_id), name: String(row.name), status: String(row.status), accountPurpose: String(row.account_purpose), registrationDateISO: new Date(row.created_at).toISOString(), assignmentStatus: row.assignment_id ? 'ASSIGNED' : 'UNASSIGNED', assignedProfessional: row.consultant_user_id ? { userId: String(row.consultant_user_id), name: String(row.professional_name), role: String(row.professional_role) } : null, assignedToMe: Boolean(row.assigned_to_me), assignmentId: row.assignment_id ? String(row.assignment_id) : null, assignmentCreatedAtISO: row.assignment_created_at ? new Date(row.assignment_created_at).toISOString() : null, foodPreferenceStatus: String(row.food_preference_status), subscriptionStatus: row.subscription_status ? String(row.subscription_status) : 'NONE', product: 'FITEATSY' }));
};
export const listClientAllocationPool = async (input) => {
    const result = await pool.query(`select c.fiteatsy_client_id, u.id as user_id, u.name, u.status, u.account_purpose, u.created_at,
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
        and ($1 = '' or lower(u.name) like '%' || lower($1) || '%' or lower(coalesce(u.email_normalized, '')) like '%' || lower($1) || '%')
        and ($5 = 'all' or ($5 = 'unassigned' and active_assignment.id is null) or ($5 = 'assigned' and active_assignment.id is not null) or ($5 = 'mine' and active_assignment.consultant_user_id = $4))
      order by u.created_at desc limit $2 offset $3`, [input.query.trim(), input.limit, input.offset, input.professionalUserId, input.assignmentFilter]);
    return result.rows.map((row) => ({ clientId: String(row.fiteatsy_client_id), userId: String(row.user_id), name: String(row.name), status: String(row.status), accountPurpose: String(row.account_purpose), registrationDateISO: new Date(row.created_at).toISOString(), assignmentStatus: row.assignment_id ? 'ASSIGNED' : 'UNASSIGNED', assignedProfessional: row.consultant_user_id ? { userId: String(row.consultant_user_id), name: String(row.professional_name), role: String(row.professional_role) } : null, assignedToMe: Boolean(row.assigned_to_me), assignmentId: row.assignment_id ? String(row.assignment_id) : null, assignmentCreatedAtISO: row.assignment_created_at ? new Date(row.assignment_created_at).toISOString() : null, foodPreferenceStatus: String(row.food_preference_status), subscriptionStatus: row.subscription_status ? String(row.subscription_status) : 'NONE', product: 'FITEATSY' }));
};
export const discoverProfessionalsForAssignment = async (professionalType) => {
    const result = await pool.query(`select id, name, first_name, last_name, email_normalized, role, status from users
      where deleted_at is null and lower(coalesce(status, '')) = 'active'
        and lower(coalesce(role, '')) in ('consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor')
        and ($1::text is null or upper(case when lower(role) in ('provider', 'dietician', 'senior_consultant') then 'CONSULTANT' else role end) = $1)
      order by name asc`, [professionalType ?? null]);
    return result.rows.map(mapProfessional);
};
export const createProfessionalAssignment = async (input) => {
    const connection = await pool.connect();
    try {
        await connection.query('begin');
        const previous = await connection.query(`update consultant_client_assignments
          set status = 'revoked', ends_at = now(), revoked_at = now(), revoked_by_user_id = $2, updated_at = now()
        where client_user_id = $1 and product = 'FITEATSY' and status = 'active'
        returning *`, [input.clientUserId, input.actorUserId]);
        for (const row of previous.rows) {
            await connection.query(`insert into professional_assignment_audit_events
          (id, assignment_id, action, actor_user_id, client_user_id, professional_user_id, professional_type, relationship_type, reason)
         values ($1, $2, 'REASSIGNED', $3, $4, $5, $6, $7, $8)`, [crypto.randomUUID(), row.id, input.actorUserId, input.clientUserId, row.consultant_user_id, row.professional_type, row.relationship_type, input.reason ?? 'Client reassigned']);
        }
        const result = await connection.query(`insert into consultant_client_assignments
      (id, consultant_user_id, client_user_id, created_by_user_id, product, professional_type, relationship_type)
     select $1, professional.id, client.id, $2, 'FITEATSY', $4, $5
       from users professional join users client on client.id = $3
       join fiteatsy_clients fc on fc.account_user_id = client.id and fc.deleted_at is null and lower(coalesce(fc.status, '')) = 'active'
      where professional.id = $6 and professional.deleted_at is null and client.deleted_at is null
        and lower(coalesce(professional.status, '')) = 'active'
        and lower(coalesce(professional.role, '')) in ('consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor')
     on conflict (consultant_user_id, client_user_id, scope) where status = 'active'
     do update set updated_at = now()
     returning *`, [crypto.randomUUID(), input.actorUserId, input.clientUserId, input.professionalType, input.relationshipType, input.professionalUserId]);
        if (!result.rowCount) {
            await connection.query('rollback');
            return null;
        }
        const row = result.rows[0];
        await connection.query(`insert into professional_assignment_audit_events
        (id, assignment_id, action, actor_user_id, client_user_id, professional_user_id, professional_type, relationship_type, reason)
       values ($1, $2, 'CREATED', $3, $4, $5, $6, $7, $8)`, [crypto.randomUUID(), row.id, input.actorUserId, input.clientUserId, input.professionalUserId, input.professionalType, input.relationshipType, input.reason ?? null]);
        await connection.query('commit');
        return row;
    }
    catch (error) {
        await connection.query('rollback');
        throw error;
    }
    finally {
        connection.release();
    }
};
export const listProfessionalAssignments = async (professionalUserId) => {
    const result = await pool.query(`select a.*, c.fiteatsy_client_id, client.name as client_name, professional.name as professional_name
       from consultant_client_assignments a
       join users client on client.id = a.client_user_id
       join users professional on professional.id = a.consultant_user_id
       join fiteatsy_clients c on c.account_user_id = client.id
      where a.product = 'FITEATSY' and ($1::text is null or a.consultant_user_id = $1)
      order by a.updated_at desc`, [professionalUserId ?? null]);
    return result.rows;
};
export const revokeProfessionalAssignment = async (assignmentId, actorUserId, reason) => {
    const result = await pool.query(`update consultant_client_assignments set status = 'revoked', ends_at = now(), revoked_at = now(), revoked_by_user_id = $2, updated_at = now() where id = $1 and product = 'FITEATSY' and status = 'active' returning *`, [assignmentId, actorUserId]);
    if (!result.rowCount)
        return null;
    const row = result.rows[0];
    await audit({ assignmentId, action: 'REVOKED', actorUserId, clientUserId: String(row.client_user_id), professionalUserId: String(row.consultant_user_id), professionalType: String(row.professional_type), relationshipType: String(row.relationship_type), reason });
    return row;
};
export const syncLegacyProfessionalAssignment = async (input) => {
    if (!input.professionalUserId)
        return;
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
