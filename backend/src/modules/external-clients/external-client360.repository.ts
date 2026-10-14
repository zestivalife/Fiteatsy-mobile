import crypto from 'node:crypto';
import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import { pool } from '../../db/pool.js';
import { resolveActiveTenantContext } from '../tenancy/tenant-context.js';
import { ExternalClientError } from './external-clients.repository.js';
import { calculateCompletion, deriveExternalDietEligibility, externalDietMissingFields, INTAKE_SECTIONS, intakeRequiredState } from './external-client-intake.repository.js';

const authority = async (account: AuthenticatedAccount, clientId: string) => {
  const tenant = await resolveActiveTenantContext(account);
  if (!tenant || tenant.tenantType === 'ZESTIVA_INTERNAL' || !['OWNER', 'CONSULTANT'].includes(tenant.currentMembershipRole)) throw new ExternalClientError('EXTERNAL_CLIENT360_AUTHORITY_REQUIRED', 403, 'External practice authority is required.');
  const result = await pool.query('select * from external_clients where id=$1 and tenant_id=$2 and deleted_at is null', [clientId, tenant.tenantId]);
  if (!result.rowCount) throw new ExternalClientError('EXTERNAL_CLIENT_NOT_FOUND', 404, 'Client not found.');
  return { tenantId: tenant.tenantId, client: result.rows[0] };
};
const sourceLabel = (source: string) => source === 'CLIENT_SELF_REPORTED' ? 'Self-reported' : source === 'CONSULTANT_ENTERED' ? 'Entered by Consultant' : source === 'LAB_REPORT' ? 'From uploaded report' : 'System-derived';
const withSource = (value: unknown, source: string, updatedAt: unknown) => ({ value: value ?? null, source, sourceLabel: sourceLabel(source), updatedAt });
const age = (dob: unknown) => { const match=typeof dob==='string'?dob.match(/^(\d{4})-(\d{2})-(\d{2})/):null;if(!match)return null;const born=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));if(Number.isNaN(born.getTime())||born.getUTCFullYear()!==Number(match[1])||born.getUTCMonth()!==Number(match[2])-1||born.getUTCDate()!==Number(match[3]))return null;const now = new Date(); let years = now.getUTCFullYear() - born.getUTCFullYear(); if (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())) years--; return years >= 0 ? years : null; };

const project = async (account: AuthenticatedAccount, clientId: string) => {
  const scoped = await authority(account, clientId);
  const [intakeResult, documentsResult, overridesResult, timelineResult] = await Promise.all([
    pool.query('select * from external_client_intakes where tenant_id=$1 and client_id=$2 order by updated_at desc limit 1', [scoped.tenantId, clientId]),
    pool.query("select id,category,original_filename,display_name,mime_type,file_size_bytes,source,document_date,provider_name,notes,status,processing_status,uploaded_at from external_client_documents where tenant_id=$1 and client_id=$2 and status='ACTIVE' order by uploaded_at desc", [scoped.tenantId, clientId]),
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
  const requiredState = intakeRequiredState(sections);
  const missingSections = Object.entries(requiredState).filter(([, complete]) => !complete).map(([field]) => field);
  const missingRequiredFields = externalDietMissingFields(sections);
  const dietEligibility=deriveExternalDietEligibility(sections,{consentedAt:intake?.consented_at,intakeStatus:intake?.status,clientIntakeState:scoped.client.intake_state});
  const completion = calculateCompletion(sections);
  const measurements = sections.measurements || {};
  const height = Number(measurements.heightCm); const weight = Number(measurements.weightKg);
  const bmi = height > 0 && weight > 0 ? Number((weight / ((height / 100) ** 2)).toFixed(2)) : null;
  const latest = Math.max(new Date(scoped.client.updated_at).getTime(), intake?.last_saved_at ? new Date(intake.last_saved_at).getTime() : 0, ...documentsResult.rows.map((document) => new Date(document.uploaded_at).getTime()));
  const basic = sections.basicProfile || {};
  const basicMeta = (field: string) => provenance.basicProfile?.[field] || { source: 'CONSULTANT_ENTERED', updatedAt: scoped.client.updated_at };
  const sourced = (field: string, fallback: unknown) => { const meta = basicMeta(field); return withSource(basic[field] ?? fallback, meta.source, meta.updatedAt); };
  return {
    overview: { name: [basic.firstName ?? scoped.client.first_name, basic.lastName ?? scoped.client.last_name].filter(Boolean).join(' '), age: age(basic.dateOfBirth ?? scoped.client.date_of_birth), gender: basic.gender ?? scoped.client.gender, primaryContact: basic.mobile ?? basic.email ?? scoped.client.mobile ?? scoped.client.email, status: scoped.client.status, intakeStatus: scoped.client.intake_state, profileCompleteness: completion, missingSections, missingRequiredFields, dietPlanEligible: dietEligibility.eligible, dietPlanEligibilityReasons:dietEligibility.reasons, dietPlanWarnings:dietEligibility.warnings, primaryGoal: sections.goals?.primaryGoal ?? null, dietPreference: sections.nutrition?.dietPreference ?? null, latestUpdatedAt: new Date(latest).toISOString(), documentCount: documentsResult.rowCount, latestWeight: measurements.weightKg ?? null },
    basicProfile: { firstName: sourced('firstName', scoped.client.first_name), lastName: sourced('lastName', scoped.client.last_name), mobile: sourced('mobile', scoped.client.mobile), email: sourced('email', scoped.client.email), dateOfBirth: sourced('dateOfBirth', scoped.client.date_of_birth), gender: sourced('gender', scoped.client.gender) },
    sections, provenance,
    derived: bmi === null ? {} : { bmi: withSource(bmi, 'SYSTEM_DERIVED', intake?.last_saved_at) },
    documents: documentsResult.rows.map((document) => ({ id: document.id, name: document.display_name, originalFilename:document.original_filename, category: document.category, mimeType: document.mime_type, fileSizeBytes: document.file_size_bytes, source:document.source, sourceLabel:document.source==='CLIENT_SELF_REPORTED'?'Uploaded by Client':'Uploaded by Consultant',documentDate:document.document_date,providerName:document.provider_name,notes:document.notes,uploadedAt:document.uploaded_at,status:document.status,processingStatus:document.processing_status })),
    consent: intake ? { version: intake.consent_version, consentedAt: intake.consented_at, status: intake.consented_at ? 'ACCEPTED' : 'NOT_PROVIDED' } : { status: 'NOT_PROVIDED' },
    timeline: timelineResult.rows.map((event) => ({ type: event.event_type, occurredAt: event.created_at, category: event.event_type.startsWith('CLIENT_INTAKE') ? 'INTAKE' : event.event_type.includes('DOCUMENT') ? 'DOCUMENT' : event.event_type.includes('INVITATION') ? 'INVITATION' : 'PROFILE' })),
  };
};

export const getExternalClient360 = project;
export const getExternalClientTimeline = async (account: AuthenticatedAccount, clientId: string) => (await project(account, clientId)).timeline;
export const getExternalClientDocuments = async (account: AuthenticatedAccount, clientId: string) => (await project(account, clientId)).documents;
export const getExternalClientDocument = async (account: AuthenticatedAccount, clientId: string, documentId: string) => {
  const scoped = await authority(account, clientId);
  const result = await pool.query("select original_file,original_filename,mime_type from external_client_documents where id=$1 and client_id=$2 and tenant_id=$3 and status='ACTIVE'", [documentId, clientId, scoped.tenantId]);
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

export const updateExternalDietEligibility = async (account:AuthenticatedAccount,clientId:string,input:{values:Record<string,unknown>})=>{
  const scoped=await authority(account,clientId);
  const current=await project(account,clientId);
  const missing=current.overview.missingRequiredFields as Array<{code:string;section:string;field:string;label:string;consultantCanEdit:boolean}>;
  const allowed=new Map(missing.filter(field=>field.consultantCanEdit).map(field=>[field.code,field]));
  if(!Object.keys(input.values).length||Object.keys(input.values).some(code=>!allowed.has(code)))throw new ExternalClientError('INVALID_MISSING_FIELD_UPDATE',400,'Only currently missing editable fields may be updated.');
  const entries=Object.entries(input.values).map(([code,value])=>{const field=allowed.get(code)!;if(code==='CURRENT_WEIGHT'&&!(Number(value)>0))throw new ExternalClientError('INVALID_CURRENT_WEIGHT',400,'Enter a valid current weight.');if(code!=='CURRENT_WEIGHT'&&!(typeof value==='string'&&value.trim()))throw new ExternalClientError('MISSING_REQUIRED_VALUE',400,`${field.label} is required.`);return{field,value};});
  const db=await pool.connect();
  try{await db.query('begin');for(const {field,value} of entries){await db.query('update external_client_profile_overrides set superseded_at=now() where tenant_id=$1 and client_id=$2 and section=$3 and field_key=$4 and superseded_at is null',[scoped.tenantId,clientId,field.section,field.field]);await db.query('insert into external_client_profile_overrides(id,tenant_id,client_id,section,field_key,value,provenance,actor_user_id) values($1,$2,$3,$4,$5,$6::jsonb,\'CONSULTANT_ENTERED\',$7)',[crypto.randomUUID(),scoped.tenantId,clientId,field.section,field.field,JSON.stringify(value),account.user.id]);}
    const intakeResult=await db.query('select * from external_client_intakes where tenant_id=$1 and client_id=$2 order by updated_at desc limit 1 for update',[scoped.tenantId,clientId]);
    if(intakeResult.rowCount){const intake=intakeResult.rows[0];const sections:Record<string,Record<string,unknown>>=structuredClone(intake.sections||{});const overrides=await db.query('select section,field_key,value from external_client_profile_overrides where tenant_id=$1 and client_id=$2 and superseded_at is null',[scoped.tenantId,clientId]);for(const row of overrides.rows)sections[row.section]={...(sections[row.section]||{}),[row.field_key]:row.value};const missing=externalDietMissingFields(sections);if(missing.length===0&&intake.consented_at){await db.query("update external_client_intakes set status='COMPLETED',completion_percent=100,submitted_at=coalesce(submitted_at,now()),last_saved_at=now(),updated_at=now() where id=$1 and tenant_id=$2 and client_id=$3",[intake.id,scoped.tenantId,clientId]);await db.query("update external_client_invitations set status='COMPLETED',completed_at=coalesce(completed_at,now()) where id=$1 and tenant_id=$2 and client_id=$3",[intake.invitation_id,scoped.tenantId,clientId]);await db.query("update external_clients set intake_state='COMPLETED',status=case when status in ('INVITED','INTAKE_STARTED') then 'INTAKE_COMPLETED' else status end,updated_at=now() where id=$1 and tenant_id=$2",[clientId,scoped.tenantId]);}}
    await db.query('insert into external_client_audit_events(id,tenant_id,client_id,actor_user_id,event_type,metadata) values($1,$2,$3,$4,\'CLIENT_REQUIRED_INFORMATION_COMPLETED\',$5::jsonb)',[crypto.randomUUID(),scoped.tenantId,clientId,account.user.id,JSON.stringify({fields:entries.map(({field})=>field.code)})]);await db.query('commit');}catch(error){await db.query('rollback');throw error;}finally{db.release();}
  return project(account,clientId);
};
