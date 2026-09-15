import { Router } from 'express';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { getHealthProfileBundle } from '../platform/platform.service.js';
import { z } from 'zod';
import { pool } from '../../db/pool.js';

export const profileRouter = Router();

profileRouter.use(requireAuthenticatedAccount);

const profileEditSchema=z.object({
  name:z.string().trim().min(1).max(120),
  dateOfBirthISO:z.string().date().refine(value=>{const date=new Date(`${value}T00:00:00.000Z`);const age=(Date.now()-date.getTime())/31557600000;return date.getTime()<=Date.now()&&age>=10&&age<=120;},'Date of birth is outside the supported range.'),
  gender:z.enum(['Male','Female','Prefer not to say']),
  heightCm:z.number().finite().min(100).max(250),
  currentWeightKg:z.number().finite().min(20).max(300)
});

profileRouter.patch('/',async(req,res)=>{const parsed=profileEditSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_PROFILE',details:parsed.error.flatten()});const account=getAuthenticatedAccount(req);const client=await pool.connect();try{await client.query('begin');await client.query('update users set name=$2,updated_at=now() where id=$1',[account.user.id,parsed.data.name]);const result=await client.query(`update health_profiles set date_of_birth_iso=$2::date,calculated_age=date_part('year',age(current_date,$2::date))::int,gender=$3,height_cm=$4,current_weight_kg=$5,updated_at=now(),version=version+1 where user_id=$1 and deleted_at is null returning date_of_birth_iso,gender,height_cm,current_weight_kg,version,updated_at`,[account.user.id,parsed.data.dateOfBirthISO,parsed.data.gender,parsed.data.heightCm,parsed.data.currentWeightKg]);if(!result.rows[0]){await client.query('rollback');return res.status(404).json({error:'HEALTH_PROFILE_NOT_FOUND'});}await client.query('commit');const row=result.rows[0];return res.json({profile:{name:parsed.data.name,dateOfBirthISO:String(row.date_of_birth_iso).slice(0,10),gender:row.gender,heightCm:Number(row.height_cm),currentWeightKg:Number(row.current_weight_kg),version:Number(row.version),updatedAt:row.updated_at.toISOString()}});}catch(error){await client.query('rollback');throw error;}finally{client.release();}});

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
