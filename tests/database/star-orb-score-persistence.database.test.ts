import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { closePool, getPool } from '../../backend/src/db/pool.js';
import { migrateDatabase, resetMigrationStateForTests } from '../../backend/src/db/migrator.js';
import { createHealthScores, listHealthScoreHistory } from '../../backend/src/modules/intelligence/health-scores.repository.js';

const databaseTest=process.env.DATABASE_URL?test:test.skip;
const tenantId=randomUUID();const accountId=randomUUID();const clientId=randomUUID();
const owner={accountId,clientId};

test.before(async()=>{if(!process.env.DATABASE_URL)return;
  resetMigrationStateForTests();await migrateDatabase();const pool=getPool();
  await pool.query(`insert into tenants(id,name,slug,tenant_type,status) values($1,'Star Orb Persistence',$2,'FITEATSY','active')`,[tenantId,`star-orb-${tenantId}`]);
  await pool.query(`insert into users(id,name,role,status,account_purpose) values($1,'Star Orb Client','user','active','QA_TEST')`,[accountId]);
  await pool.query(`insert into fiteatsy_clients(id,fiteatsy_client_id,account_user_id,tenant_id) values($1,$2,$3,$4)`,[clientId,`fc_star_orb_${Date.now()}`,accountId,tenantId]);
});
test.after(async()=>{if(!process.env.DATABASE_URL)return;const pool=getPool();await pool.query('delete from health_scores where user_id=$1',[accountId]);
  await pool.query('delete from fiteatsy_clients where id=$1',[clientId]);await pool.query('delete from users where id=$1',[accountId]);
  await pool.query('delete from tenants where id=$1',[tenantId]);await closePool();});

databaseTest('daily Star Orb scores upsert by owner, domain, methodology and health day',async()=>{
  const base={scoreType:'activity' as const,scoreStatus:'calculated' as const,confidence:.66,
    calculationVersion:'STAR_ORB_SCORING_ENGINE_V1',healthDay:'2026-11-18'};
  const first=await createHealthScores(owner,[{...base,scoreValue:62.25,inputSummary:{wellnessState:'PARTIAL',componentCoverage:40}}]);
  const second=await createHealthScores(owner,[{...base,scoreValue:78.75,inputSummary:{wellnessState:'PARTIAL',componentCoverage:80}}]);
  assert.equal(first[0].id,second[0].id);
  const history=await listHealthScoreHistory(owner,{scoreType:'activity',limit:10,offset:0});
  assert.equal(history.length,1);assert.equal(history[0].scoreValue,78.75);
  assert.deepEqual(history[0].inputSummary,{wellnessState:'PARTIAL',componentCoverage:80});
  const uniqueness=await getPool().query(`select count(*)::int count from health_scores where user_id=$1 and client_id=$2 and score_type='activity' and health_day='2026-11-18' and calculation_version='STAR_ORB_SCORING_ENGINE_V1'`,[accountId,clientId]);
  assert.equal(uniqueness.rows[0].count,1);
});

databaseTest('seven-day persistence keeps gaps explicit and does not duplicate retries',async()=>{
  const days=Array.from({length:7},(_,index)=>`2026-11-${String(12+index).padStart(2,'0')}`);
  const rows=days.map((healthDay,index)=>({scoreType:'recovery' as const,scoreValue:index===2?null:60+index+.25,
    scoreStatus:index===2?'insufficient_data' as const:'calculated' as const,confidence:index===2?0:.66,
    inputSummary:index===2?{wellnessState:'INSUFFICIENT_DATA',componentCoverage:0}:{wellnessState:'PARTIAL',componentCoverage:60},
    calculationVersion:'STAR_ORB_SCORING_ENGINE_V1',healthDay}));
  await createHealthScores(owner,rows);await createHealthScores(owner,rows);
  const history=await listHealthScoreHistory(owner,{scoreType:'recovery',limit:20,offset:0});
  assert.equal(history.length,7);assert.equal(history.find(row=>row.healthDay===days[2])?.scoreValue,null);
  assert.equal(history.find(row=>row.healthDay===days[2])?.scoreStatus,'insufficient_data');
});
