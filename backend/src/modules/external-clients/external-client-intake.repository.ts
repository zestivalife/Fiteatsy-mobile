import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { ExternalClientError } from './external-clients.repository.js';
import { validateExternalDocumentFile } from './external-client-documents.repository.js';
import { processExternalClientReportForIntake } from './external-biomarkers.repository.js';

export const INTAKE_SECTIONS = [
  'aboutYou','medicalHistory','conditionsSymptoms','allergiesFamilyHistory',
  'medicationsSupplements','lifestyle','sleepStress','activityHydration',
  'nutrition','goals','measurements','womensHealth','reportsDocuments'
] as const;
export type IntakeSection = typeof INTAKE_SECTIONS[number];
const CONSENT_VERSION = 'external-health-intake-v1';
const hashToken=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');

type Authority={invitationId:string;tenantId:string;clientId:string;practiceName:string;practitionerName:string;client:any;status:string;expiresAt:Date};
export const externalClientBrandName=(tenantType:string|undefined,tenantName:string|undefined,practitionerName:string|undefined)=>{
  const practitioner=practitionerName?.trim();
  const organisation=tenantName?.trim();
  if(tenantType==='INDEPENDENT_CONSULTANT')return practitioner||organisation||'Your consultant';
  if(tenantType==='PRACTICE'||tenantType==='CLINIC')return organisation||practitioner||'Your consultant';
  return practitioner||organisation||'Your consultant';
};
const resolveAuthority=async(db:any,rawToken:string,write=true):Promise<Authority>=>{
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(rawToken))throw new ExternalClientError('INVITATION_INVALID',404,'This invitation is invalid or unavailable.');
  const result=await db.query(`select i.id invitation_id,i.tenant_id,i.client_id,i.status,i.expires_at,
    t.name practice_name,t.tenant_type,u.name practitioner_name,c.first_name,c.last_name,c.display_name,c.mobile,c.email,c.date_of_birth,c.gender
    from external_client_invitations i
    join external_clients c on c.id=i.client_id and c.tenant_id=i.tenant_id and c.deleted_at is null
    join tenants t on t.id=i.tenant_id join users u on u.id=i.created_by_user_id
    where i.token_hash=$1 for update of i`,[hashToken(rawToken)]);
  if(!result.rowCount)throw new ExternalClientError('INVITATION_INVALID',404,'This invitation is invalid or unavailable.');
  const row=result.rows[0];
  if(row.status==='REVOKED')throw new ExternalClientError('INVITATION_REVOKED',410,'This invitation is no longer available.');
  if(row.status==='EXPIRED'||new Date(row.expires_at)<=new Date())throw new ExternalClientError('INVITATION_EXPIRED',410,'This invitation has expired.');
  if(write&&row.status==='COMPLETED')throw new ExternalClientError('INTAKE_ALREADY_COMPLETED',409,'This health profile has already been submitted.');
  return{invitationId:row.invitation_id,tenantId:row.tenant_id,clientId:row.client_id,practiceName:externalClientBrandName(row.tenant_type,row.practice_name,row.practitioner_name),practitionerName:row.practitioner_name,client:row,status:row.status,expiresAt:new Date(row.expires_at)};
};
const audit=(db:any,a:Authority,event:string,metadata:Record<string,unknown>={})=>db.query(`insert into external_client_audit_events(id,tenant_id,client_id,actor_user_id,event_type,metadata) values($1,$2,$3,null,$4,$5::jsonb)`,[crypto.randomUUID(),a.tenantId,a.clientId,event,JSON.stringify({invitationId:a.invitationId,...metadata})]);
const present=(value:unknown)=>typeof value==='string'?value.trim().length>0:value!==null&&value!==undefined;
export const EXTERNAL_DIET_REQUIRED_FIELDS = [
  {code:'PRIMARY_GOAL',section:'goals',field:'primaryGoal',label:'Primary goal',control:'PILL_SINGLE',consultantCanEdit:true,clientCanEdit:true},
  {code:'DIET_PREFERENCE',section:'nutrition',field:'dietPreference',label:'Primary diet preference',control:'PILL_SINGLE',consultantCanEdit:true,clientCanEdit:true},
  {code:'CURRENT_WEIGHT',section:'measurements',field:'weightKg',label:'Current weight',control:'STRUCTURED_NUMBER',unit:'kg',consultantCanEdit:true,clientCanEdit:true},
] as const;
export const intakeRequiredState=(sections:any)=>({
  firstName:present(sections?.aboutYou?.firstName),lastName:present(sections?.aboutYou?.lastName),
  gender:present(sections?.aboutYou?.gender),
  contact:present(sections?.aboutYou?.mobile)||present(sections?.aboutYou?.email),
  primaryGoal:present(sections?.goals?.primaryGoal),
  dietPreference:present(sections?.nutrition?.dietPreference),
  currentWeight:Number(sections?.measurements?.weightKg)>0,
});
export const externalDietMissingFields=(sections:any)=>EXTERNAL_DIET_REQUIRED_FIELDS.filter(field=>field.code==='CURRENT_WEIGHT'?!(Number(sections?.[field.section]?.[field.field])>0):!present(sections?.[field.section]?.[field.field]));
export type ExternalDietEligibilityWarning='REQUIRED_FIELDS_MISSING'|'CONSENT_PENDING'|'INTAKE_NOT_SUBMITTED'|'DIET_PREFERENCE_NOT_PROVIDED'|'PRIMARY_GOAL_NOT_PROVIDED'|'CURRENT_WEIGHT_NOT_PROVIDED'|'ALLERGY_INFORMATION_NOT_PROVIDED';
export const deriveExternalDietEligibility=(sections:any,lifecycle:{consentedAt:unknown;intakeStatus:unknown;clientIntakeState:unknown})=>{
  const missingRequiredFields=externalDietMissingFields(sections);
  const warnings:ExternalDietEligibilityWarning[]=[];
  if(missingRequiredFields.length)warnings.push('REQUIRED_FIELDS_MISSING');
  if(missingRequiredFields.some(field=>field.code==='DIET_PREFERENCE'))warnings.push('DIET_PREFERENCE_NOT_PROVIDED');
  if(missingRequiredFields.some(field=>field.code==='PRIMARY_GOAL'))warnings.push('PRIMARY_GOAL_NOT_PROVIDED');
  if(missingRequiredFields.some(field=>field.code==='CURRENT_WEIGHT'))warnings.push('CURRENT_WEIGHT_NOT_PROVIDED');
  const allergy=sections?.allergiesFamilyHistory;
  if(!allergy||(!present(allergy.hasAllergies)&&!Array.isArray(allergy.foodAllergies)))warnings.push('ALLERGY_INFORMATION_NOT_PROVIDED');
  if(!lifecycle.consentedAt)warnings.push('CONSENT_PENDING');
  if(lifecycle.intakeStatus!=='COMPLETED'||lifecycle.clientIntakeState!=='COMPLETED')warnings.push('INTAKE_NOT_SUBMITTED');
  return{eligible:true,reasons:[],warnings,missingRequiredFields};
};
export const calculateCompletion=(sections:any)=>{const state=intakeRequiredState(sections);const required=Object.values(state);return Math.max(0,Math.min(100,Math.floor(required.filter(Boolean).length*100/required.length)));};
export const normaliseExternalIntakeSection=(section:IntakeSection,payload:Record<string,unknown>)=>{
  const value=JSON.parse(JSON.stringify(payload||{}));
  if(section==='medicalHistory'){
    if(value.hadSurgery!=='YES')delete value.surgeryProcedure;
    if(value.hospitalised!=='YES')delete value.hospitalisationReason;
    if(value.underTreatment!=='YES')delete value.treatmentDetails;
  }
  if(section==='allergiesFamilyHistory'&&value.hasAllergies!=='YES'){
    delete value.allergyTypes;delete value.foodAllergies;delete value.medicationAllergies;delete value.environmentalAllergies;delete value.otherAllergy;
  }
  if(section==='medicationsSupplements'){
    if(value.takesMedication!=='YES')delete value.medications;
    if(value.takesSupplements!=='YES')delete value.supplements;
  }
  if(section==='activityHydration'&&value.intentionalExercise!=='YES'){
    delete value.exerciseTypes;delete value.exerciseFrequency;
  }
  if(section==='nutrition'){
    if(value.skipMeals==='NEVER')delete value.skippedMeals;
    if(value.hasCravings!=='YES')delete value.cravings;
  }
  return value;
};
const map=(row:any,documents:any[]=[])=>({status:row.status,currentSection:row.current_section,completionPercent:calculateCompletion(row.sections||{}),sections:row.sections||{},missingRequiredFields:externalDietMissingFields(row.sections||{}),provenance:row.provenance,startedAt:row.started_at,lastSavedAt:row.last_saved_at,submittedAt:row.submitted_at,consentVersion:row.consent_version,consentedAt:row.consented_at,documents:documents.map(d=>({id:d.id,category:d.category,fileName:d.original_filename,mimeType:d.mime_type,fileSize:d.file_size_bytes,provenance:d.source,processingStatus:d.processing_status||'UPLOADED',createdAt:d.uploaded_at}))});
const getOrCreate=async(db:any,a:Authority)=>{
  const existing=await db.query(`select * from external_client_intakes where invitation_id=$1 and tenant_id=$2 and client_id=$3 for update`,[a.invitationId,a.tenantId,a.clientId]);
  if(existing.rowCount)return existing.rows[0];
  const resumable=await db.query(`update external_client_intakes set invitation_id=$1,updated_at=now() where tenant_id=$2 and client_id=$3 and status<>'COMPLETED' returning *`,[a.invitationId,a.tenantId,a.clientId]);
  if(resumable.rowCount)return resumable.rows[0];
  const id=crypto.randomUUID();
  const aboutYou={firstName:a.client.first_name,lastName:a.client.last_name,dateOfBirth:a.client.date_of_birth,gender:a.client.gender,mobile:a.client.mobile,email:a.client.email};
  const created=await db.query(`insert into external_client_intakes(id,tenant_id,client_id,invitation_id,status,current_section,completion_percent,sections,started_at,last_saved_at)
    values($1,$2,$3,$4,'IN_PROGRESS','aboutYou',$5,$6::jsonb,now(),now()) returning *`,[id,a.tenantId,a.clientId,a.invitationId,calculateCompletion({aboutYou}),JSON.stringify({aboutYou})]);
  await db.query(`update external_clients set intake_state='IN_PROGRESS',status=case when status='INVITED' then 'INTAKE_STARTED' else status end,updated_at=now() where id=$1 and tenant_id=$2`,[a.clientId,a.tenantId]);
  await audit(db,a,'CLIENT_INTAKE_STARTED',{intakeId:id});
  return created.rows[0];
};
export const getExternalClientIntake=async(rawToken:string)=>{const db=await pool.connect();try{await db.query('begin');const a=await resolveAuthority(db,rawToken,false);let row;if(a.status==='COMPLETED'){const found=await db.query(`select status,submitted_at from external_client_intakes where invitation_id=$1 and tenant_id=$2 and client_id=$3`,[a.invitationId,a.tenantId,a.clientId]);if(!found.rowCount)throw new ExternalClientError('INTAKE_NOT_FOUND',404,'Health profile was not found.');await db.query('commit');return{practiceName:a.practiceName,clientName:a.client.display_name,intake:{status:'COMPLETED',submittedAt:found.rows[0].submitted_at}};}row=await getOrCreate(db,a);const docs=await db.query(`select id,category,original_filename,mime_type,file_size_bytes,source,processing_status,uploaded_at from external_client_documents where intake_id=$1 and tenant_id=$2 and client_id=$3 and status='ACTIVE' order by uploaded_at`,[row.id,a.tenantId,a.clientId]);await db.query('commit');return{practiceName:a.practiceName,practitionerName:a.practitionerName,clientName:a.client.display_name,expiresAt:a.expiresAt.toISOString(),intake:map(row,docs.rows)};}catch(e){try{await db.query('rollback');}catch{}throw e;}finally{db.release();}};
export const saveExternalClientIntakeSection=async(rawToken:string,section:IntakeSection,payload:Record<string,unknown>,currentSection:string)=>{const db=await pool.connect();try{await db.query('begin');const a=await resolveAuthority(db,rawToken,true);const row=await getOrCreate(db,a);const canonicalPayload=section==='aboutYou'?{...payload,firstName:a.client.first_name,lastName:a.client.last_name,dateOfBirth:a.client.date_of_birth,mobile:a.client.mobile,email:a.client.email}:payload;const sections={...(row.sections||{}),[section]:normaliseExternalIntakeSection(section,canonicalPayload)};const completion=calculateCompletion(sections);const saved=await db.query(`update external_client_intakes set status='IN_PROGRESS',sections=$1::jsonb,current_section=$2,completion_percent=$3,last_saved_at=now(),updated_at=now() where id=$4 and tenant_id=$5 and client_id=$6 returning *`,[JSON.stringify(sections),currentSection,completion,row.id,a.tenantId,a.clientId]);await db.query('commit');return map(saved.rows[0]);}catch(e){try{await db.query('rollback');}catch{}throw e;}finally{db.release();}};
export const uploadExternalClientIntakeDocument=async(rawToken:string,input:{category:string;fileName:string;mimeType:string;buffer:Buffer})=>{const valid=validateExternalDocumentFile(input);const db=await pool.connect();let processing:null|{tenantId:string;clientId:string;documentId:string}=null;try{await db.query('begin');const a=await resolveAuthority(db,rawToken,true);const intake=await getOrCreate(db,a);const id=crypto.randomUUID();const digest=crypto.createHash('sha256').update(input.buffer).digest('hex');const duplicate=await db.query("select id from external_client_documents where tenant_id=$1 and client_id=$2 and content_hash=$3 and status='ACTIVE'",[a.tenantId,a.clientId,digest]);if(duplicate.rowCount)throw new ExternalClientError('DOCUMENT_DUPLICATE',409,'This file already exists for the client.');const result=await db.query(`insert into external_client_documents(id,tenant_id,client_id,intake_id,invitation_id,uploaded_via_intake_id,category,original_filename,display_name,mime_type,file_size_bytes,storage_reference,source,content_hash,original_file,processing_status) values($1,$2,$3,$4,$5,$4,$6,$7,$7,$8,$9,$1,'CLIENT_INTAKE_UPLOAD',$10,$11,$12) returning id,category,original_filename,mime_type,file_size_bytes,source,processing_status,uploaded_at`,[id,a.tenantId,a.clientId,intake.id,a.invitationId,input.category,valid.fileName,valid.mimeType,input.buffer.length,digest,input.buffer,input.category==='LAB_REPORT'?'QUEUED':'NOT_APPLICABLE']);const sections={...(intake.sections||{}),reportsDocuments:{uploaded:true}};await db.query(`update external_client_intakes set sections=$1::jsonb,completion_percent=$2,last_saved_at=now(),updated_at=now() where id=$3 and tenant_id=$4 and client_id=$5`,[JSON.stringify(sections),calculateCompletion(sections),intake.id,a.tenantId,a.clientId]);await audit(db,a,'CLIENT_DOCUMENT_UPLOADED',{intakeId:intake.id,documentId:result.rows[0].id,category:input.category});await db.query('commit');if(input.category==='LAB_REPORT')processing={tenantId:a.tenantId,clientId:a.clientId,documentId:id};if(processing)void processExternalClientReportForIntake(processing.tenantId,processing.clientId,processing.documentId).catch(()=>undefined);const document=result.rows[0];return{id:document.id,category:document.category,fileName:document.original_filename,mimeType:document.mime_type,fileSize:document.file_size_bytes,provenance:document.source,processingStatus:document.processing_status,createdAt:document.uploaded_at};}catch(e){try{await db.query('rollback');}catch{}throw e;}finally{db.release();}};
export const reviewExternalClientIntake=async(rawToken:string)=>getExternalClientIntake(rawToken);
export const submitExternalClientIntake=async(rawToken:string,input:{consentAccepted:boolean;consentVersion:string})=>{if(!input.consentAccepted||input.consentVersion!==CONSENT_VERSION)throw new ExternalClientError('INTAKE_CONSENT_REQUIRED',400,'Consent is required before submission.');const db=await pool.connect();try{await db.query('begin');const a=await resolveAuthority(db,rawToken,true);const intake=await getOrCreate(db,a);const effectiveSections:Record<string,Record<string,unknown>>=structuredClone(intake.sections||{});const overrides=await db.query('select section,field_key,value from external_client_profile_overrides where tenant_id=$1 and client_id=$2 and superseded_at is null',[a.tenantId,a.clientId]);for(const row of overrides.rows)effectiveSections[row.section]={...(effectiveSections[row.section]||{}),[row.field_key]:row.value};const required=intakeRequiredState(effectiveSections);if(Object.values(required).some(value=>!value)||externalDietMissingFields(effectiveSections).length)throw new ExternalClientError('INTAKE_REQUIRED_FIELDS_MISSING',400,'Complete all required health-profile information before submission.');const saved=await db.query(`update external_client_intakes set status='COMPLETED',completion_percent=100,consent_version=$1,consented_at=now(),submitted_at=now(),last_saved_at=now(),updated_at=now() where id=$2 and tenant_id=$3 and client_id=$4 returning *`,[CONSENT_VERSION,intake.id,a.tenantId,a.clientId]);await db.query(`update external_client_invitations set status='COMPLETED',completed_at=now() where id=$1 and tenant_id=$2 and client_id=$3`,[a.invitationId,a.tenantId,a.clientId]);await db.query(`update external_clients set intake_state='COMPLETED',status=case when status in ('INVITED','INTAKE_STARTED') then 'INTAKE_COMPLETED' else status end,updated_at=now() where id=$1 and tenant_id=$2`,[a.clientId,a.tenantId]);await audit(db,a,'CLIENT_CONSENT_ACCEPTED',{intakeId:intake.id,consentVersion:CONSENT_VERSION});await audit(db,a,'CLIENT_INTAKE_SUBMITTED',{intakeId:intake.id});await db.query('commit');return{practiceName:a.practiceName,intake:map(saved.rows[0])};}catch(e){try{await db.query('rollback');}catch{}throw e;}finally{db.release();}};
export const externalIntakeConsentVersion=CONSENT_VERSION;
