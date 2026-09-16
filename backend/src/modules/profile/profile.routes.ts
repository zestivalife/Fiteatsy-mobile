import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { getHealthProfileBundle } from '../platform/platform.service.js';
import { z } from 'zod';
import { pool } from '../../db/pool.js';

export const profileRouter = Router();

profileRouter.use(requireAuthenticatedAccount);

const dob=z.string().date().refine(value=>{const date=new Date(`${value}T00:00:00.000Z`);const age=(Date.now()-date.getTime())/31557600000;return date.getTime()<=Date.now()&&age>=10&&age<=120;},'Date of birth is outside the supported range.');
const nullableNumber=(min:number,max:number)=>z.number().finite().min(min).max(max).nullable().optional();
const bodyFatSources=['MANUAL','CALCULATED','APPLE_HEALTH','HEALTH_CONNECT','SMART_SCALE','CONSULTANT','OTHER'] as const;
const personalSchema=z.object({section:z.literal('PERSONAL'),firstName:z.string().trim().min(1).max(80),lastName:z.string().trim().max(80),dateOfBirthISO:dob,gender:z.enum(['Male','Female','Prefer not to say']),location:z.string().trim().max(160).nullable().optional()});
const healthSchema=z.object({section:z.literal('HEALTH'),heightCm:nullableNumber(100,250),currentWeightKg:nullableNumber(20,300),waistCm:nullableNumber(20,250),hipCm:nullableNumber(20,250),neckCm:nullableNumber(10,100),armCircumferenceCm:nullableNumber(10,100),thighCircumferenceCm:nullableNumber(20,150),calfCircumferenceCm:nullableNumber(10,100),bodyFatPct:nullableNumber(2,75),bodyFatSource:z.enum(bodyFatSources).nullable().optional(),bodyFatMeasuredAt:z.string().datetime().nullable().optional(),muscleMassKg:nullableNumber(1,250),muscleMassCategory:z.string().trim().max(80).nullable().optional()}).superRefine((value,ctx)=>{if(value.bodyFatPct!=null&&!value.bodyFatSource)ctx.addIssue({code:'custom',path:['bodyFatSource'],message:'Body-fat source is required.'});});
const legacySchema=z.object({name:z.string().trim().min(1).max(120),dateOfBirthISO:dob,gender:z.enum(['Male','Female','Prefer not to say']),heightCm:z.number().finite().min(100).max(250),currentWeightKg:z.number().finite().min(20).max(300)});
const num=(value:unknown)=>value==null?null:Number(value);
const selectProfile=async(userId:string,db:{query:typeof pool.query}=pool)=>(await db.query(`select u.name,u.email_normalized,u.mobile_number_normalized,hp.* from users u join health_profiles hp on hp.user_id=u.id and hp.deleted_at is null where u.id=$1`,[userId])).rows[0];
const response=(row:Record<string,unknown>)=>{const parts=String(row.name??'').trim().split(/\s+/);const firstName=parts.shift()??'';return{firstName,lastName:parts.join(' '),name:String(row.name??''),dateOfBirthISO:row.date_of_birth_iso?String(row.date_of_birth_iso).slice(0,10):null,gender:row.gender??null,location:row.location??null,heightCm:num(row.height_cm),currentWeightKg:num(row.current_weight_kg),waistCm:num(row.waist_cm),hipCm:num(row.hip_cm),neckCm:num(row.neck_cm),armCircumferenceCm:num(row.arm_circumference_cm),thighCircumferenceCm:num(row.thigh_circumference_cm),calfCircumferenceCm:num(row.calf_circumference_cm),bodyFatPct:num(row.body_fat_pct),bodyFatSource:row.body_fat_source??null,bodyFatMeasuredAt:row.body_fat_measured_at instanceof Date?row.body_fat_measured_at.toISOString():row.body_fat_measured_at??null,bodyFatUpdatedAt:row.body_fat_updated_at instanceof Date?row.body_fat_updated_at.toISOString():row.body_fat_updated_at??null,muscleMassKg:num(row.muscle_mass_kg),muscleMassCategory:row.muscle_mass_category??null,email:row.email_normalized??null,mobileNumber:row.mobile_number_normalized??null,version:Number(row.version),updatedAt:(row.updated_at as Date).toISOString()};};

profileRouter.get('/',async(req,res)=>{const row=await selectProfile(getAuthenticatedAccount(req).user.id);return row?res.json({profile:response(row)}):res.status(404).json({error:'HEALTH_PROFILE_NOT_FOUND'});});

// @ts-expect-error The compound success guard below guarantees the legacy payload before access.
profileRouter.patch('/',async(req,res)=>{const personal=personalSchema.safeParse(req.body);const health=healthSchema.safeParse(req.body);const legacy=legacySchema.safeParse(req.body);if(!personal.success&&!health.success&&!legacy.success)return res.status(400).json({error:'INVALID_PROFILE',details:personal.error.flatten()});const account=getAuthenticatedAccount(req);const client=await pool.connect();try{await client.query('begin');if(personal.success||legacy.success){const value=personal.success?personal.data:{section:'PERSONAL' as const,firstName:legacy.data.name,lastName:'',dateOfBirthISO:legacy.data.dateOfBirthISO,gender:legacy.data.gender,location:undefined};const name=[value.firstName,value.lastName].filter(Boolean).join(' ');await client.query('update users set name=$2,updated_at=now() where id=$1',[account.user.id,name]);const result=await client.query(`update health_profiles set date_of_birth_iso=$2::date,calculated_age=date_part('year',age(current_date,$2::date))::int,gender=$3,location=coalesce($4,location),updated_at=now(),version=version+1 where user_id=$1 and deleted_at is null returning id`,[account.user.id,value.dateOfBirthISO,value.gender,value.location]);if(!result.rows[0])throw new Error('HEALTH_PROFILE_NOT_FOUND');if(legacy.success)await client.query('update health_profiles set height_cm=$2,current_weight_kg=$3 where user_id=$1 and deleted_at is null',[account.user.id,legacy.data.heightCm,legacy.data.currentWeightKg]);}else if(health.success){const before=await selectProfile(account.user.id,client);if(!before)throw new Error('HEALTH_PROFILE_NOT_FOUND');const v=health.data;await client.query(`update health_profiles set height_cm=$2,current_weight_kg=$3,waist_cm=$4,hip_cm=$5,neck_cm=$6,arm_circumference_cm=$7,thigh_circumference_cm=$8,calf_circumference_cm=$9,body_fat_pct=$10,body_fat_source=$11,body_fat_measured_at=$12::timestamptz,body_fat_updated_at=case when body_fat_pct is distinct from $10 then now() else body_fat_updated_at end,muscle_mass_kg=$13,muscle_mass_category=$14,updated_at=now(),version=version+1 where user_id=$1 and deleted_at is null`,[account.user.id,v.heightCm,v.currentWeightKg,v.waistCm,v.hipCm,v.neckCm,v.armCircumferenceCm,v.thighCircumferenceCm,v.calfCircumferenceCm,v.bodyFatPct,v.bodyFatSource,v.bodyFatMeasuredAt,v.muscleMassKg,v.muscleMassCategory]);const keys={WEIGHT:'current_weight_kg',BODY_FAT:'body_fat_pct',WAIST:'waist_cm',HIP:'hip_cm',NECK:'neck_cm',MID_UPPER_ARM:'arm_circumference_cm',THIGH:'thigh_circumference_cm',CALF:'calf_circumference_cm',MUSCLE_MASS:'muscle_mass_kg'} as const;const entries:[keyof typeof keys,string,string,number|null|undefined][]=[['WEIGHT','kg','MANUAL',v.currentWeightKg],['BODY_FAT','%',v.bodyFatSource??'MANUAL',v.bodyFatPct],['WAIST','cm','MANUAL',v.waistCm],['HIP','cm','MANUAL',v.hipCm],['NECK','cm','MANUAL',v.neckCm],['MID_UPPER_ARM','cm','MANUAL',v.armCircumferenceCm],['THIGH','cm','MANUAL',v.thighCircumferenceCm],['CALF','cm','MANUAL',v.calfCircumferenceCm],['MUSCLE_MASS','kg','MANUAL',v.muscleMassKg]];for(const[type,unit,source,value]of entries)if(value!=null&&num(before[keys[type]])!==value)await client.query(`insert into health_profile_measurement_history(id,health_profile_id,user_id,measurement_type,value,unit,source,measured_at) values($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz,now()))`,[randomUUID(),before.id,account.user.id,type,value,unit,source,type==='BODY_FAT'?v.bodyFatMeasuredAt:null]);}await client.query('commit');const row=await selectProfile(account.user.id);return res.json({profile:response(row)});}catch(error){await client.query('rollback');if((error as Error).message==='HEALTH_PROFILE_NOT_FOUND')return res.status(404).json({error:'HEALTH_PROFILE_NOT_FOUND'});throw error;}finally{client.release();}});

profileRouter.get('/completion', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const bundle = await getHealthProfileBundle({
    accountId: account.accountId,
    clientId: account.client.id
  });

  if (!bundle) {
    return res.status(404).json({ error: 'HEALTH_PROFILE_NOT_FOUND' });
  }

  return res.status(200).json({
    completionPercent: bundle.nutrition.completionPercent,
    readinessScore: bundle.nutrition.readinessScore,
    aiReady: bundle.nutrition.aiReady,
    missingFields: bundle.nutrition.missingFields,
    sections: bundle.nutrition.sectionScores.map((section) => ({
      name: section.section,
      completion: section.percent,
      missing: section.missing
    }))
  });
});
