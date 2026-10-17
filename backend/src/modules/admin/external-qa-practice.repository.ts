import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { provisionExternalConsultant } from '../external-signup/external-signup.repository.js';

export const EXTERNAL_QA_PROFESSIONS = [
  'DIABETES_EDUCATOR', 'PSYCHOLOGIST', 'WELLNESS_CONSULTANT', 'HEALTH_COACH',
  'BEHAVIOURAL_THERAPIST', 'OCCUPATIONAL_THERAPIST', 'PHYSIOTHERAPIST', 'MENTAL_WELLNESS_THERAPIST'
] as const;
export type ExternalQaProfession = typeof EXTERNAL_QA_PROFESSIONS[number];

export type ExternalQaPracticeInput = {
  fixtureKey: string;
  authIdentityId: string;
  professionCode: ExternalQaProfession;
  tenantName: string;
  consultantDisplayName: string;
  consultantEmail: string;
  clientCount: number;
  specialisation?: string;
  seedProfile?: Record<string, unknown>;
  actorReference: string;
  idempotencyKey: string;
};

export class ExternalQaPracticeError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'ExternalQaPracticeError';
  }
}

const projection = (row: Record<string, unknown>, replayed: boolean) => ({
  provisioningId: String(row.id), fixtureKey: String(row.fixture_key),
  authIdentityId: String(row.auth_identity_id), userId: String(row.fiteatsy_user_id),
  tenantId: String(row.tenant_id), professionCode: String(row.profession_code),
  clientIds: Array.isArray(row.created_client_ids) ? row.created_client_ids : [],
  status: String(row.status), provisioningSource: String(row.provisioning_source), idempotentReplay: replayed
});

const assertQaInput = (input: ExternalQaPracticeInput) => {
  const email = input.consultantEmail.trim().toLowerCase();
  const tenant = input.tenantName.trim().toLowerCase();
  if (!email.endsWith('@zestiva.test') || !(email.startsWith('qa+') || email.startsWith('qa-'))) {
    throw new ExternalQaPracticeError('QA_EMAIL_REQUIRED', 422, 'A clearly labelled QA email is required.');
  }
  if (!/(^|\b)(qa|test)(\b|[-_])/i.test(tenant)) {
    throw new ExternalQaPracticeError('QA_TENANT_LABEL_REQUIRED', 422, 'The tenant name must be clearly labelled QA or Test.');
  }
  if (!input.fixtureKey.startsWith('external-qa-')) {
    throw new ExternalQaPracticeError('QA_FIXTURE_KEY_REQUIRED', 422, 'A governed External QA fixture key is required.');
  }
};

export async function provisionExternalQaPractice(input: ExternalQaPracticeInput) {
  assertQaInput(input);
  const existing = await pool.query('select * from external_qa_practice_provisioning where fixture_key=$1', [input.fixtureKey]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.auth_identity_id !== input.authIdentityId || row.profession_code !== input.professionCode) {
      throw new ExternalQaPracticeError('QA_FIXTURE_BINDING_CONFLICT', 409, 'The QA fixture is already bound to another identity or profession.');
    }
    await pool.query(
      `insert into external_qa_practice_audit_events(id,provisioning_id,event_type,actor_reference,profession_code,tenant_id,fiteatsy_user_id,created_entities)
       values($1,$2,'QA_EXTERNAL_PRACTICE_REUSED',$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), row.id, input.actorReference, row.profession_code, row.tenant_id, row.fiteatsy_user_id,
        JSON.stringify({ clientIds: row.created_client_ids })]
    );
    return projection(row, true);
  }
  const collision = await pool.query(
    `select u.id,s.auth_identity_id from users u
       left join external_consultant_signups s on s.fiteatsy_user_id=u.id
      where u.email_normalized=$1`, [input.consultantEmail.trim().toLowerCase()]
  );
  if (collision.rowCount && collision.rows[0].auth_identity_id !== input.authIdentityId) {
    throw new ExternalQaPracticeError('QA_IDENTITY_COLLISION', 409, 'The requested QA email is already assigned and cannot be reused.');
  }

  const workspace = await provisionExternalConsultant({
    authIdentityId: input.authIdentityId, name: input.consultantDisplayName,
    email: input.consultantEmail, accountType: 'PRACTICE_OWNER',
    professionalTitle: input.professionCode.replaceAll('_', ' ').toLowerCase(),
    speciality: input.specialisation, practiceName: input.tenantName,
    contactVerification: 'VERIFIED_MOBILE', professionalDetails: {
      ...(input.seedProfile ?? {}), professionCode: input.professionCode, qaClassification: 'GOVERNED_EXTERNAL_QA'
    }, country: 'IN', timezone: 'Asia/Kolkata', idempotencyKey: input.idempotencyKey,
    actorReference: input.actorReference
  });
  if (!workspace.signupId || !workspace.userId || !workspace.tenantId) {
    throw new ExternalQaPracticeError('QA_WORKSPACE_INCOMPLETE', 503, 'Canonical External workspace provisioning did not complete.');
  }

  const db = await pool.connect();
  try {
    await db.query('begin');
    const clientIds: string[] = [];
    for (let index = 0; index < input.clientCount; index += 1) {
      const clientId = crypto.randomUUID();
      const sequence = index + 1;
      const display = `QA ${input.professionCode.replaceAll('_', ' ').toLowerCase()} Client ${sequence}`;
      const email = `qa+${input.fixtureKey.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-client-${sequence}@zestiva.test`;
      await db.query(
        `insert into external_clients(id,tenant_id,first_name,last_name,display_name,email,email_normalized,status,intake_state,source,created_by_user_id,notes_summary)
         values($1,$2,'QA',$3,$4,$5,$5,'ACTIVE','NOT_STARTED','CONSULTANT_ENTERED',$6,'Synthetic governed QA client; no real personal or health data.')`,
        [clientId, workspace.tenantId, `${input.professionCode.replaceAll('_', ' ')} Client ${sequence}`, display, email, workspace.userId]
      );
      clientIds.push(clientId);
    }
    const provisioningId = crypto.randomUUID();
    const inserted = await db.query(
      `insert into external_qa_practice_provisioning(id,fixture_key,auth_identity_id,signup_id,fiteatsy_user_id,tenant_id,profession_code,created_client_ids,created_by_reference)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [provisioningId, input.fixtureKey, input.authIdentityId, workspace.signupId, workspace.userId,
        workspace.tenantId, input.professionCode, JSON.stringify(clientIds), input.actorReference]
    );
    await db.query(
      `insert into external_qa_practice_audit_events(id,provisioning_id,event_type,actor_reference,profession_code,tenant_id,fiteatsy_user_id,created_entities)
       values($1,$2,'QA_EXTERNAL_PRACTICE_PROVISIONED',$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), provisioningId, input.actorReference, input.professionCode, workspace.tenantId,
        workspace.userId, JSON.stringify({ signupId: workspace.signupId, membershipId: workspace.ownerMembershipId, clientIds })]
    );
    await db.query('commit');
    return projection(inserted.rows[0], false);
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally { db.release(); }
}

export async function deactivateExternalQaPractice(fixtureKey: string, actorReference: string, reason: string) {
  const db = await pool.connect();
  try {
    await db.query('begin');
    const selected = await db.query('select * from external_qa_practice_provisioning where fixture_key=$1 for update', [fixtureKey]);
    if (!selected.rowCount) throw new ExternalQaPracticeError('QA_EXTERNAL_PRACTICE_NOT_FOUND', 404, 'QA External practice was not found.');
    const row = selected.rows[0];
    if (row.status !== 'DEACTIVATED') {
      await db.query("update tenant_memberships set status='removed',removed_at=now(),updated_at=now() where tenant_id=$1 and user_id=$2", [row.tenant_id, row.fiteatsy_user_id]);
      await db.query("update tenants set status='suspended',updated_at=now() where id=$1", [row.tenant_id]);
      await db.query("update external_practitioner_profiles set status='suspended',updated_at=now() where tenant_id=$1 and user_id=$2", [row.tenant_id, row.fiteatsy_user_id]);
      await db.query("update external_qa_practice_provisioning set status='DEACTIVATED',deactivated_at=now(),deactivated_by_reference=$2,deactivation_reason=$3,updated_at=now() where id=$1", [row.id, actorReference, reason]);
      await db.query(
        `insert into external_qa_practice_audit_events(id,provisioning_id,event_type,actor_reference,profession_code,tenant_id,fiteatsy_user_id,created_entities,reason)
         values($1,$2,'QA_EXTERNAL_PRACTICE_DEACTIVATED',$3,$4,$5,$6,$7,$8)`,
        [crypto.randomUUID(), row.id, actorReference, row.profession_code, row.tenant_id, row.fiteatsy_user_id,
          JSON.stringify({ clientIds: row.created_client_ids }), reason]
      );
    }
    await db.query('commit');
    return { fixtureKey, tenantId: row.tenant_id, userId: row.fiteatsy_user_id, status: 'DEACTIVATED' };
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
