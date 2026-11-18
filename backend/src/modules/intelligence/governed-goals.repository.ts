import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export type GoalKind = 'steps'|'exercise_minutes'|'mindfulness_minutes'|'mind_sessions';
export type GoalSource = 'USER'|'CONSULTANT';
const units:Record<GoalKind,string>={steps:'steps',exercise_minutes:'minutes',mindfulness_minutes:'minutes',mind_sessions:'sessions'};
const dateOnly=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);

export const listGovernedGoals = async (owner:{accountId:string;clientId:string;tenantId:string}) => {
  const result=await pool.query(`select * from governed_wellness_goals where user_id=$1 and client_id=$2 and tenant_id=$3::uuid order by effective_from,revision`,[owner.accountId,owner.clientId,owner.tenantId]);
  return result.rows;
};

export const reviseGovernedGoal = async (owner:{accountId:string;clientId:string;tenantId:string},input:{kind:GoalKind;value:number;effectiveFrom:string;source:GoalSource}) => {
  const client=await pool.connect();
  try{
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`governed-goal:${owner.tenantId}:${owner.clientId}:${input.kind}:${input.source}`]);
    const current=await client.query(`select * from governed_wellness_goals where user_id=$1 and client_id=$2 and tenant_id=$3::uuid and goal_kind=$4 and source=$5 and status='active' for update`,[owner.accountId,owner.clientId,owner.tenantId,input.kind,input.source]);
    const prior=current.rows[0]??null;
    const priorDay=prior?dateOnly(prior.effective_from):null;
    if(prior&&Number(prior.goal_value)===input.value&&priorDay===input.effectiveFrom){await client.query('commit');return prior;}
    if(prior&&input.effectiveFrom===priorDay)throw Object.assign(new Error('GOAL_SAME_DAY_REVISION_CONFLICT'),{statusCode:409});
    if(prior&&input.effectiveFrom<priorDay!)throw Object.assign(new Error('GOAL_BACKDATED_REVISION_REJECTED'),{statusCode:409});
    if(prior) await client.query(`update governed_wellness_goals set status='superseded',effective_through=greatest(effective_from,least(coalesce(effective_through,$1::date),$1::date-1)),updated_at=now() where id=$2`,[input.effectiveFrom,prior.id]);
    const inserted=await client.query(`insert into governed_wellness_goals(id,user_id,client_id,tenant_id,goal_kind,goal_value,unit,source,status,approved,effective_from,revision,supersedes_goal_id) values($1,$2,$3,$4::uuid,$5,$6,$7,$8,'active',true,$9::date,$10,$11) returning *`,[crypto.randomUUID(),owner.accountId,owner.clientId,owner.tenantId,input.kind,input.value,units[input.kind],input.source,input.effectiveFrom,Number(prior?.revision??0)+1,prior?.id??null]);
    await client.query('commit');return inserted.rows[0];
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
};
