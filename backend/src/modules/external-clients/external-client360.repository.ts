import crypto from 'node:crypto';
import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import { pool } from '../../db/pool.js';
import { resolveActiveTenantContext } from '../tenancy/tenant-context.js';
import { ExternalClientError } from './external-clients.repository.js';
import { INTAKE_SECTIONS } from './external-client-intake.repository.js';

const authority = async (account: AuthenticatedAccount, clientId: string) => {
  const tenant = await resolveActiveTenantContext(account);
  if (!tenant || tenant.tenantType === 'ZESTIVA_INTERNAL' || !['OWNER', 'CONSULTANT'].includes(tenant.currentMembershipRole)) throw new ExternalClientError('EXTERNAL_CLIENT360_AUTHORITY_REQUIRED', 403, 'External practice authority is required.');
  const result = await pool.query('select * from external_clients where id=$1 and tenant_id=$2 and deleted_at is null', [clientId, tenant.tenantId]);
  if (!result.rowCount) throw new ExternalClientError('EXTERNAL_CLIENT_NOT_FOUND', 404, 'Client not found.');
  return { tenantId: tenant.tenantId, client: result.rows[0] };
};
const sourceLabel = (source: string) => source === 'CLIENT_SELF_REPORTED' ? 'Self-reported' : source === 'CONSULTANT_ENTERED' ? 'Entered by Consultant' : source === 'LAB_REPORT' ? 'From uploaded report' : 'System-derived';
const withSource = (value: unknown, source: string, updatedAt: unknown) => ({ value: value ?? null, source, sourceLabel: sourceLabel(source), updatedAt });
const age = (dob: unknown) => { if (!dob) return null; const born = new Date(String(dob)); const now = new Date(); let years = now.getUTCFullYear() - born.getUTCFullYear(); if (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())) years--; return years >= 0 ? years : null; };

const project = async (account: AuthenticatedAccount, clientId: string) => {
  const scoped = await authority(account, clientId);
  const [intakeResult, documentsResult, overridesResult, timelineResult] = await Promise.all([
    pool.query('select * from external_client_intakes where tenant_id=$1 and client_id=$2 order by updated_at desc limit 1', [scoped.tenantId, clientId]),
    pool.query('select id,category,original_file_name,mime_type,file_size,provenance,created_at from external_client_intake_documents where tenant_id=$1 and client_id=$2 order by created_at desc', [scoped.tenantId, clientId]),
    pool.query('select section,field_key,value,provenance,created_at from external_client_profile_overrides where tenant_id=$1 and client_id=$2 and superseded_at is null', [scoped.tenantId, clientId]),
    pool.query('select event_type,created_at from external_client_audit_events where tenant_id=$1 and client_id=$2 order by created_at desc limit 100', [scoped.tenantId, clientId]),
  ]);
  const intake = intakeResult.rows[0] || null;
  const sections: Record<string, Record<string, any>> = structuredClone(intake?.sections || {});
  const provenance: Record<string, any> = {};
  for (const section of INTAKE_SECTIONS) if (sections[section]) provenance[section] = { source: 'CLIENT_SELF_REPORTED', sourceLabel: sourceLabel('CLIENT_SELF_REPORTED'), updatedAt: intake.last_saved_at };
  for (const row of overridesResult.rows) {
    sections[row.section] = { ...(sections[row.section] || {}), [row.field_key]: row.value };
    provenance[row.section] = { ...(provenance[row.section] || {}), [row.field_key]: { source: row.provenance, sourceLabel: sourceLabel(row.provenance), updatedAt: row.created_at } };
  }
  const applicable = sections.aboutYou?.gender === 'FEMALE' ? INTAKE_SECTIONS : INTAKE_SECTIONS.filter((section) => section !== 'womensHealth');
  const missingSections = applicable.filter((section) => !sections[section] || Object.keys(sections[section]).length === 0);
  const completion = Math.max(0, Math.min(100, intake?.completion_percent || 0));
  const measurements = sections.measurements || {};
  const height = Number(measurements.height); const weight = Number(measurements.weight);
  const bmi = height > 0 && weight > 0 && measurements.heightUnit === 'cm' && measurements.weightUnit === 'kg' ? Number((weight / ((height / 100) ** 2)).toFixed(2)) : null;
  const latest = Math.max(new Date(scoped.client.updated_at).getTime(), intake?.last_saved_at ? new Date(intake.last_saved_at).getTime() : 0, ...documentsResult.rows.map((document) => new Date(document.created_at).getTime()));
  const basic = sections.basicProfile || {};
  const basicMeta = (field: string) => provenance.basicProfile?.[field] || { source: 'CONSULTANT_ENTERED', updatedAt: scoped.client.updated_at };
  const sourced = (field: string, fallback: unknown) => { const meta = basicMeta(field); return withSource(basic[field] ?? fallback, meta.source, meta.updatedAt); };
  return {
    overview: { name: [basic.firstName ?? scoped.client.first_name, basic.lastName ?? scoped.client.last_name].filter(Boolean).join(' '), age: age(basic.dateOfBirth ?? scoped.client.date_of_birth), gender: basic.gender ?? scoped.client.gender, primaryContact: basic.mobile ?? basic.email ?? scoped.client.mobile ?? scoped.client.email, status: scoped.client.status, intakeStatus: scoped.client.intake_state, profileCompleteness: completion, missingSections, primaryGoal: sections.goals?.primaryGoal ?? null, dietPreference: sections.nutrition?.dietPreference ?? null, latestUpdatedAt: new Date(latest).toISOString(), documentCount: documentsResult.rowCount, latestWeight: measurements.weight ?? null },
    basicProfile: { firstName: sourced('firstName', scoped.client.first_name), lastName: sourced('lastName', scoped.client.last_name), mobile: sourced('mobile', scoped.client.mobile), email: sourced('email', scoped.client.email), dateOfBirth: sourced('dateOfBirth', scoped.client.date_of_birth), gender: sourced('gender', scoped.client.gender) },
    sections, provenance,
    derived: bmi === null ? {} : { bmi: withSource(bmi, 'SYSTEM_DERIVED', intake?.last_saved_at) },
    documents: documentsResult.rows.map((document) => { const source = document.category === 'LAB_REPORT' ? 'LAB_REPORT' : document.provenance; return { id: document.id, name: document.original_file_name, category: document.category, mimeType: document.mime_type, fileSize: document.file_size, source, sourceLabel: sourceLabel(source), uploadedAt: document.created_at, status: 'AVAILABLE' }; }),
    consent: intake ? { version: intake.consent_version, consentedAt: intake.consented_at, status: intake.consented_at ? 'ACCEPTED' : 'NOT_PROVIDED' } : { status: 'NOT_PROVIDED' },
    timeline: timelineResult.rows.map((event) => ({ type: event.event_type, occurredAt: event.created_at, category: event.event_type.startsWith('CLIENT_INTAKE') ? 'INTAKE' : event.event_type.includes('DOCUMENT') ? 'DOCUMENT' : event.event_type.includes('INVITATION') ? 'INVITATION' : 'PROFILE' })),
  };
};

export const getExternalClient360 = project;
export const getExternalClientTimeline = async (account: AuthenticatedAccount, clientId: string) => (await project(account, clientId)).timeline;
export const getExternalClientDocuments = async (account: AuthenticatedAccount, clientId: string) => (await project(account, clientId)).documents;
export const getExternalClientDocument = async (account: AuthenticatedAccount, clientId: string, documentId: string) => {
  const scoped = await authority(account, clientId);
  const result = await pool.query('select original_file,original_file_name,mime_type from external_client_intake_documents where id=$1 and client_id=$2 and tenant_id=$3', [documentId, clientId, scoped.tenantId]);
  if (!result.rowCount) throw new ExternalClientError('EXTERNAL_DOCUMENT_NOT_FOUND', 404, 'Document not found.');
  return result.rows[0];
};
export const updateExternalClient360 = async (account: AuthenticatedAccount, clientId: string, input: { section: string; values: Record<string, unknown> }) => {
  const scoped = await authority(account, clientId);
  const allowed = ['basicProfile', 'medicalHistory', 'conditionsSymptoms', 'allergiesFamilyHistory', 'medicationsSupplements', 'lifestyle', 'sleepStress', 'activityHydration', 'nutrition', 'goals', 'measurements', 'womensHealth'];
  if (!allowed.includes(input.section)) throw new ExternalClientError('CLIENT360_SECTION_NOT_EDITABLE', 400, 'This section cannot be edited.');
  const db = await pool.connect();
  try {
    await db.query('begin');
    for (const [field, value] of Object.entries(input.values)) {
      await db.query('update external_client_profile_overrides set superseded_at=now() where tenant_id=$1 and client_id=$2 and section=$3 and field_key=$4 and superseded_at is null', [scoped.tenantId, clientId, input.section, field]);
      await db.query('insert into external_client_profile_overrides(id,tenant_id,client_id,section,field_key,value,actor_user_id) values($1,$2,$3,$4,$5,$6::jsonb,$7)', [crypto.randomUUID(), scoped.tenantId, clientId, input.section, field, JSON.stringify(value ?? null), account.user.id]);
    }
    const event = input.section === 'goals' ? 'CLIENT_GOAL_UPDATED' : input.section === 'measurements' ? 'CLIENT_MEASUREMENT_ADDED' : input.section === 'basicProfile' ? 'CLIENT_PROFILE_UPDATED' : 'CLIENT_HEALTH_DATA_UPDATED';
    await db.query('insert into external_client_audit_events(id,tenant_id,client_id,actor_user_id,event_type,metadata) values($1,$2,$3,$4,$5,$6::jsonb)', [crypto.randomUUID(), scoped.tenantId, clientId, account.user.id, event, JSON.stringify({ section: input.section, fields: Object.keys(input.values) })]);
    await db.query('commit');
    return project(account, clientId);
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
};
