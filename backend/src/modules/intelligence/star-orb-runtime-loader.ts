import { pool } from '../../db/pool.js';
import { listHealthObservationsForCalculation } from '../health/health-observations.repository.js';
import { getClientNutritionExperience } from '../nutrition/nutrition.service.js';
import type {
  CandidateRuntimeRepositories,
  RuntimeAssessment,
  RuntimeGoal,
  RuntimeMindDay,
  RuntimeNutritionDay
} from './candidate-star-orb-runtime.js';
import { listGovernedGoals } from './governed-goals.repository.js';

export type StarOrbSourceStatus = {
  source: string;
  status: 'INTEGRATED'|'UNAVAILABLE';
  reason?: string;
};

export type LoadedStarOrbRuntimeInputs = CandidateRuntimeRepositories & {
  owner: { accountId: string; clientId: string; tenantId: string };
  sourceCoverage: Record<string, StarOrbSourceStatus>;
};

const dayMs = 86_400_000;
const shiftDay = (day: string, offset: number) =>
  new Date(Date.parse(`${day}T12:00:00.000Z`) + offset * dayMs).toISOString().slice(0, 10);

const timezoneOffsetMinutes = (timezone: string, day: string) => {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
    hour: '2-digit'
  }).formatToParts(new Date(`${day}T12:00:00.000Z`)).find((item) => item.type === 'timeZoneName')?.value;
  const match = part?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
};

const finiteOrNull = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const databaseDateOnly = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new RangeError('INVALID_DATABASE_HEALTH_DAY');
  return parsed.toISOString().slice(0, 10);
};
const deduplicateObservations = <T extends { sourceProvider:string;sourceRecordId:string|null;metricType:string;syncKey:string;providerUpdatedAtISO:string|null;createdAtISO:string }>(rows:T[]) => {
  const byIdentity=new Map<string,T>();
  for(const row of rows){
    const identity=row.sourceRecordId?`${row.sourceProvider}:${row.sourceRecordId}:${row.metricType}`:`sync:${row.syncKey}`;
    const current=byIdentity.get(identity);
    const timestamp=(value:T)=>Date.parse(value.providerUpdatedAtISO??value.createdAtISO);
    if(!current||timestamp(row)>=timestamp(current))byIdentity.set(identity,row);
  }
  return [...byIdentity.values()];
};

export async function loadStarOrbRuntimeInputs(
  authenticatedUserId: string,
  healthDay: string,
  context: { tenantId: string; timezone: string }
): Promise<LoadedStarOrbRuntimeInputs> {
  const clientResult = await pool.query(
    `select id,tenant_id from fiteatsy_clients
      where account_user_id=$1 and tenant_id=$2::uuid and status='active' and deleted_at is null
      limit 1`,
    [authenticatedUserId, context.tenantId]
  );
  if (!clientResult.rows[0]) throw new Error('AUTHENTICATED_CLIENT_NOT_FOUND');
  const owner = {
    accountId: authenticatedUserId,
    clientId: String(clientResult.rows[0].id),
    tenantId: String(clientResult.rows[0].tenant_id)
  };
  const [storedObservations, profileResult, checkinsResult, assessmentsResult,storedGoals,sessionResult] = await Promise.all([
    listHealthObservationsForCalculation(owner,{fromISO:`${shiftDay(healthDay,-35)}T00:00:00.000Z`,throughISO:`${shiftDay(healthDay,1)}T00:00:00.000Z`}),
    pool.query(
      `select sleep_goal_hours,created_at,updated_at from health_profiles
        where user_id=$1 and client_id=$2 and status='active' and deleted_at is null
        order by updated_at desc limit 1`,
      [owner.accountId, owner.clientId]
    ),
    pool.query(
      `select checkin_date,mood from daily_checkins
        where user_id=$1 and client_id=$2 and checkin_date between $3::date-interval '34 days' and $3::date
        order by checkin_date`,
      [owner.accountId, owner.clientId, healthDay]
    ),
    pool.query(
      `select assessment_type,raw_score,max_score,completed_at from assessment_results
        where user_id=$1 and client_id=$2 and completed_at >= $3::date-interval '34 days'
          and completed_at < $3::date+interval '1 day'
        order by completed_at`,
      [owner.accountId, owner.clientId, healthDay]
    ),
    listGovernedGoals(owner),
    pool.query(`select event_type,event_time,payload from health_events where user_id=$1 and care_case_id in(select id from care_cases where client_id=$2) and event_type in('breathing_session_completed','focus_session_completed','movement_session_completed') and status='active' and deleted_at is null and event_time >= $3::date-interval '34 days' and event_time < $3::date+interval '1 day' order by event_time`,[owner.accountId,owner.clientId,healthDay])
  ]);
  const observations=deduplicateObservations(storedObservations);

  const goals: RuntimeGoal[] = [];
  for(const row of storedGoals) goals.push({kind:String(row.goal_kind) as RuntimeGoal['kind'],value:Number(row.goal_value),source:String(row.source) as 'USER'|'CONSULTANT',active:row.status!=='revoked',approved:Boolean(row.approved),updatedAt:new Date(row.updated_at).toISOString(),effectiveFrom:databaseDateOnly(row.effective_from),effectiveThrough:row.effective_through?databaseDateOnly(row.effective_through):null});
  const profile = profileResult.rows[0];
  const sleepHours = finiteOrNull(profile?.sleep_goal_hours);
  if (sleepHours != null) goals.push({
    kind: 'sleep_minutes', value: sleepHours * 60, source: 'USER', active: true, approved: true,
    updatedAt: new Date(profile.updated_at).toISOString(), effectiveFrom: new Date(profile.created_at).toISOString().slice(0, 10)
  });

  const nutrition: RuntimeNutritionDay[] = [];
  const nutritionHydration = new Map<string, number>();
  for (let offset = -6; offset <= 0; offset += 1) {
    const day = shiftDay(healthDay, offset);
    const experience = await getClientNutritionExperience(owner, day);
    if (!experience) continue;
    const consumedProtein = finiteOrNull(experience.dailyNutrition.consumedProtein);
    const targetProtein = finiteOrNull(experience.dailyNutrition.targetProtein);
    const hydrationTarget = finiteOrNull(experience.dailyNutrition.hydrationTargetMl);
    const hydrationConsumed = finiteOrNull(experience.dailyNutrition.hydrationConsumedMl);
    if (targetProtein != null) goals.push({kind:'protein_grams',value:targetProtein,source:'CONSULTANT',active:true,approved:true,updatedAt:experience.version.updatedAtISO,effectiveFrom:day,effectiveThrough:day});
    if (hydrationTarget != null) goals.push({kind:'hydration_ml',value:hydrationTarget,source:'CONSULTANT',active:true,approved:true,updatedAt:experience.version.updatedAtISO,effectiveFrom:day,effectiveThrough:day});
    if (hydrationConsumed != null && hydrationConsumed > 0) nutritionHydration.set(day, hydrationConsumed);
    nutrition.push({
      healthDay: day,
      complete: experience.mealSummary.totalMealHeads > 0 && experience.mealSummary.pendingMeals === 0,
      proteinGrams: consumedProtein ?? Number.NaN,
      // Plan adherence is not silently relabelled as food quality. No approved
      // clinical-marker scoring repository exists in the current schema.
      foodQualityDimensions: [],
      approvedClinicalMarkerScores: []
    });
  }

  const offset = timezoneOffsetMinutes(context.timezone, healthDay);
  const observationDaysWithHydration = new Set(observations.filter((item) => item.metricType === 'hydration_ml').map((item) =>
    new Date(Date.parse(item.measuredAtISO) + (item.timezoneOffsetMinutes ?? offset) * 60_000).toISOString().slice(0, 10)));
  for (const [day, value] of nutritionHydration) if (!observationDaysWithHydration.has(day)) observations.push({
    id:`nutrition-hydration:${owner.clientId}:${day}`,metricType:'hydration_ml',value,unit:'ml',
    userId:owner.accountId,clientId:owner.clientId,qualityStatus:'accepted',createdAtISO:new Date().toISOString(),
    measuredAtISO:`${day}T12:00:00.000Z`,sourceProvider:'fiteatsy_nutrition',
    sourceRecordId:`nutrition-hydration:${day}`,syncKey:`nutrition-hydration:${owner.clientId}:${day}`,
    timezoneOffsetMinutes:offset,sourceMetadata:{provenance:'nutrition_health_event'},startAtISO:null,endAtISO:null,
    providerUpdatedAtISO:null,providerVersion:null,deletedAtISO:null
  });

  const assessments: RuntimeAssessment[] = assessmentsResult.rows.flatMap((row) => {
    if (String(row.assessment_type) !== 'PSS10') return [];
    return [{healthDay:new Date(Date.parse(String(row.completed_at))+offset*60_000).toISOString().slice(0,10),kind:'PSS_10' as const,
      score:Number(row.raw_score),minimum:0,maximum:Number(row.max_score),validated:true}];
  });
  const checkins = checkinsResult.rows.map((row) => ({day:databaseDateOnly(row.checkin_date),mood:Number(row.mood)}));
  const completedByDay=new Map<string,number>();
  const mindfulnessByDay=new Map<string,number>();
  for(const row of sessionResult.rows){const payload=row.payload as Record<string,unknown>;if(payload.status!=='completed')continue;const day=typeof payload.healthDay==='string'?payload.healthDay:new Date(Date.parse(String(row.event_time))+offset*60_000).toISOString().slice(0,10);const duration=finiteOrNull(payload.durationMinutes);if(duration==null||duration<=0)continue;completedByDay.set(day,(completedByDay.get(day)??0)+1);if(row.event_type==='breathing_session_completed'||row.event_type==='focus_session_completed')mindfulnessByDay.set(day,(mindfulnessByDay.get(day)??0)+duration);}
  for(const [day,value] of mindfulnessByDay) observations.push({id:`session-mindfulness:${owner.clientId}:${day}`,metricType:'mindfulness_minutes',value,unit:'min',userId:owner.accountId,clientId:owner.clientId,qualityStatus:'accepted',createdAtISO:new Date().toISOString(),measuredAtISO:`${day}T12:00:00.000Z`,sourceProvider:'fiteatsy_sessions',sourceRecordId:`mindfulness:${day}`,syncKey:`mindfulness:${owner.clientId}:${day}`,timezoneOffsetMinutes:offset,sourceMetadata:{provenance:'completed_health_event'},startAtISO:null,endAtISO:null,providerUpdatedAtISO:null,providerVersion:null,deletedAtISO:null});
  const mindDays=[...new Set([...checkins.map(row=>row.day),...completedByDay.keys()])].sort();
  const mind: RuntimeMindDay[] = mindDays.map((day) => ({
    healthDay:day,moodCheckIns:checkins.filter(row=>row.day===day).map(row=>row.mood),completedSessions:completedByDay.get(day)??0,
    emotionalWellbeing:checkins.filter((item) => item.day <= day && item.day >= shiftDay(day,-6)).map((item) => item.mood)
  }));

  return {
    owner, observations, goals, nutrition, assessments, mind, fallbackOffsetMinutes: offset, nowISO: new Date().toISOString(),
    sourceCoverage: {
      observations:{source:'health_observations',status:'INTEGRATED'},
      sleepGoal:{source:'health_profiles.sleep_goal_hours',status:sleepHours==null?'UNAVAILABLE':'INTEGRATED',...(sleepHours==null?{reason:'NO_EXPLICIT_SLEEP_GOAL'}:{})},
      nutrition:{source:'nutrition health events through getClientNutritionExperience',status:'INTEGRATED'},
      stress:{source:'assessment_results(PSS10)',status:'INTEGRATED'},
      mood:{source:'daily_checkins.mood',status:'INTEGRATED'},
      activityGoals:{source:'governed_wellness_goals',status:storedGoals.some(row=>row.goal_kind==='steps'||row.goal_kind==='exercise_minutes')?'INTEGRATED':'UNAVAILABLE',...(storedGoals.some(row=>row.goal_kind==='steps'||row.goal_kind==='exercise_minutes')?{}:{reason:'NO_PERSISTED_NUMERIC_STEPS_OR_EXERCISE_GOAL'})},
      mindSessions:{source:'health_events completed session contract',status:'INTEGRATED'},
      wellbeing:{source:'none',status:'UNAVAILABLE',reason:'NO_VALIDATED_WELLBEING_INSTRUMENT_REPOSITORY'},
      clinicalMarkers:{source:'none',status:'UNAVAILABLE',reason:'NO_APPROVED_MARKER_TO_SCORE_PROJECTION'}
    }
  };
}
