import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';
import { getClientByAccountUserId } from '../../backend/src/modules/client/client.repository.js';
import { ingestHealthObservations } from '../../backend/src/modules/health/health-observations.repository.js';

let server: Awaited<ReturnType<typeof startTestServer>>;
const priorFlag=process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED;

test.before(async()=>{
  process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED='true';
  server=await startTestServer();
});
test.after(async()=>{
  if(priorFlag===undefined)delete process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED;
  else process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED=priorFlag;
  await server.close();
});
test.beforeEach(async()=>{await resetTestState();});

test('candidate-validation is authenticated, self-scoped and remains fail-closed for missing inputs',async()=>{
  const one=await createAuthenticatedSession(server.baseUrl,{name:'Star Orb HTTP One'});
  const two=await createAuthenticatedSession(server.baseUrl,{name:'Star Orb HTTP Two'});
  const oneClient=await getClientByAccountUserId(one.current.body.accountId);
  const twoClient=await getClientByAccountUserId(two.current.body.accountId);
  assert.ok(oneClient&&twoClient);
  const day=new Date().toISOString().slice(0,10);
  await ingestHealthObservations({accountId:one.current.body.accountId,clientId:oneClient.id},[{
    metricType:'steps',value:4321,unit:'count',measuredAtISO:new Date().toISOString(),
    sourceProvider:'qa',sourceRecordId:'client-one-only-steps',syncKey:'qa:client-one-only-steps'
  }]);
  const path=`/v1/intelligence/candidate-validation?healthDay=${day}&timezone=UTC`;

  const unauthenticated=await getJson(server.baseUrl,path);
  assert.equal(unauthenticated.response.status,401);

  const first=await getJson(server.baseUrl,path,{headers:authHeaders(one.token)});
  assert.equal(first.response.status,200,JSON.stringify(first.body));
  assert.equal(first.body.ownerScope.tenantId,oneClient.tenantId);
  assert.equal(first.body.days.length,7);
  assert.equal(first.body.days.every((item:{recovery:{score:number|null}})=>item.recovery.score===null),true);
  assert.equal(first.body.days.at(-1).activity.inputsMissing.includes('steps'),false);

  const second=await getJson(server.baseUrl,path,{headers:authHeaders(two.token)});
  assert.equal(second.response.status,200,JSON.stringify(second.body));
  assert.equal(second.body.ownerScope.tenantId,twoClient.tenantId);
  assert.equal(second.body.days.at(-1).activity.inputsMissing.includes('steps'),true);
  assert.equal(JSON.stringify(second.body).includes(oneClient.id),false);

  const priorNodeEnv=process.env.NODE_ENV;
  process.env.NODE_ENV='production';
  try{
    const productionGate=await getJson(server.baseUrl,path,{headers:authHeaders(one.token)});
    assert.equal(productionGate.response.status,404);
  }finally{
    process.env.NODE_ENV=priorNodeEnv;
  }
});
