import crypto from 'node:crypto';
import { closePool, pool } from '../db/pool.js';
import { migrateDatabase } from '../db/migrator.js';
import { createQaAssignment, deactivateQaIdentity, provisionQaIdentity, revokeQaAssignment } from '../modules/admin/qa-provisioning.repository.js';

const PURPOSE = 'COMMON_FOOD_ENGINE_E2E';
const FIXTURE_CODE = 'FITEATSY_COMMON_FOOD_PRODUCTION_E2E_V17_7';
const ACTOR = 'production-qa-cli';
const REASON = 'Governed Common Food Engine production acceptance';

const assertGuard = () => {
  if (process.env.NODE_ENV !== 'production') throw new Error('PRODUCTION_QA_REQUIRES_NODE_ENV_PRODUCTION');
  if (process.env.ALLOW_PRODUCTION_QA_FIXTURES !== 'true') throw new Error('ALLOW_PRODUCTION_QA_FIXTURES_REQUIRED');
  if (process.env.QA_FIXTURE_PURPOSE !== PURPOSE) throw new Error('QA_FIXTURE_PURPOSE_MISMATCH');
  if (!process.env.RAILWAY_ENVIRONMENT_ID && !process.env.RAILWAY_PROJECT_ID) throw new Error('RAILWAY_PRODUCTION_RUNTIME_REQUIRED');
};

const identities = [
  ['consultant', 'QA Fiteatsy Consultant', 'consultant', 'qa-common-food-consultant@invalid.example', '+919700000101'],
  ['senior', 'QA Fiteatsy Senior Consultant', 'senior_consultant', 'qa-common-food-senior@invalid.example', '+919700000102'],
  ['vegetarian', 'QA Vegetarian Client', 'user', 'qa-common-food-vegetarian@invalid.example', '+919700000103'],
  ['egg', 'QA Egg Client', 'user', 'qa-common-food-egg@invalid.example', '+919700000104'],
  ['non_vegetarian', 'QA NonVeg Client', 'user', 'qa-common-food-nonveg@invalid.example', '+919700000105'],
  ['vegan', 'QA Vegan Client', 'user', 'qa-common-food-vegan@invalid.example', '+919700000106'],
  ['unassigned', 'QA Unassigned Consultant', 'consultant', 'qa-common-food-unassigned@invalid.example', '+919700000107'],
] as const;

const upsertFixtureSet = async () => {
  const existing = await pool.query('select * from qa_fixture_sets where fixture_code = $1 for update', [FIXTURE_CODE]);
  if (existing.rowCount) {
    await pool.query(`update qa_fixture_sets set status = 'ACTIVE', expires_at = now() + interval '6 hours', deactivated_at = null, updated_at = now() where id = $1`, [existing.rows[0].id]);
    return String(existing.rows[0].id);
  }
  const id = crypto.randomUUID();
  await pool.query(`insert into qa_fixture_sets (id, fixture_code, environment, purpose, status, created_by_actor, expires_at, metadata, audit_reference)
    values ($1,$2,'PRODUCTION_QA',$3,'ACTIVE',$4,now() + interval '6 hours',$5::jsonb,$6)`,
    [id, FIXTURE_CODE, PURPOSE, ACTOR, JSON.stringify({ reportingClass: 'QA_TEST', reusable: false }), crypto.randomUUID()]);
  return id;
};

const activate = async () => {
  const migrations = await pool.query(`select version from schema_migrations where version = any($1::text[]) order by version`, [[
    '0049_common_food_combination_engine.sql', '0050_common_food_runtime_integration.sql', '0051_common_food_lifecycle_snapshot.sql', '0052_production_qa_fixture_sets.sql', '0057_p0_food_verification_ledger.sql',
  ]]);
  if (migrations.rowCount !== 5) throw new Error('REQUIRED_PRODUCTION_MIGRATIONS_NOT_APPLIED');
  const fixtureSetId = await upsertFixtureSet();
  const created = new Map<string, Awaited<ReturnType<typeof provisionQaIdentity>>>();
  for (const [fixtureRole, name, role, email, mobileNumber] of identities) {
    const identity = await provisionQaIdentity({ actorUserId: null, actorReference: ACTOR, name, role, email, mobileNumber, reason: REASON });
    await pool.query(`update users set status = 'active', updated_at = now() where id = $1 and account_purpose = 'QA_TEST'`, [identity.user.id]);
    await pool.query(`insert into qa_fixture_entities (fixture_set_id, entity_type, entity_id, fixture_role) values ($1,'USER',$2,$3) on conflict do nothing`, [fixtureSetId, identity.user.id, fixtureRole]);
    created.set(fixtureRole, identity);
  }
  const consultantId = created.get('consultant')!.user.id;
  const assignmentIds: string[] = [];
  for (const fixtureRole of ['vegetarian', 'egg', 'non_vegetarian', 'vegan']) {
    const clientUserId = created.get(fixtureRole)!.user.id;
    const current = await pool.query(`select id from consultant_client_assignments where consultant_user_id=$1 and client_user_id=$2 and status='active'`, [consultantId, clientUserId]);
    const assignment = current.rowCount ? current.rows[0] : await createQaAssignment({ actorUserId: consultantId, consultantUserId: consultantId, clientUserId, reason: REASON });
    const assignmentId = String(assignment!.id);
    assignmentIds.push(assignmentId);
    await pool.query(`insert into qa_fixture_entities (fixture_set_id, entity_type, entity_id, fixture_role) values ($1,'ASSIGNMENT',$2,$3) on conflict do nothing`, [fixtureSetId, assignmentId, `${fixtureRole}_assignment`]);
  }
  for (const [fixtureRole, dietType] of [['vegetarian','vegetarian'],['egg','eggetarian'],['non_vegetarian','non_vegetarian'],['vegan','vegan']] as const) {
    const userId = created.get(fixtureRole)!.user.id;
    await pool.query(`update health_profiles set date_of_birth_iso='1990-01-01T00:00:00.000Z', calculated_age=36, gender='Female', height_cm=165, current_weight_kg=65,
      activity_level='Moderate', diet_type=$2, meals_per_day=7, water_intake_liters=2.5, wellness_goals='["Maintain health"]'::jsonb,
      food_preference_profile=$3::jsonb, food_preference_updated_by=$1, food_preference_updated_at=now(), updated_at=now(), version=version+1
      where user_id=$1 and deleted_at is null`, [userId, dietType, JSON.stringify({ dietType, proteins: [], cuisines: ['Indian'], foodsLiked: [], foodsDisliked: [], foodsAvoided: [], likedFoodIds: [], dislikedFoodIds: [], avoidedFoodIds: [], restrictions: [], staplePreference: null, dairyPreference: null, practicality: [] })]);
  }
  return { fixtureSetId, fixtureCode: FIXTURE_CODE, status: 'ACTIVE', users: Object.fromEntries([...created].map(([key,value])=>[key,{ userId:value.user.id, clientId:value.client?.fiteatsyClientId ?? null }])), assignmentIds, expiresInHours: 6 };
};

const deactivate = async () => {
  const set = await pool.query('select id from qa_fixture_sets where fixture_code=$1', [FIXTURE_CODE]);
  if (!set.rowCount) throw new Error('QA_FIXTURE_SET_NOT_FOUND');
  const fixtureSetId = String(set.rows[0].id);
  const entities = await pool.query(`select entity_type, entity_id from qa_fixture_entities where fixture_set_id=$1 order by entity_type`, [fixtureSetId]);
  const actor = await pool.query(`select entity_id from qa_fixture_entities where fixture_set_id=$1 and fixture_role='consultant'`, [fixtureSetId]);
  const actorUserId = String(actor.rows[0]?.entity_id ?? '');
  for (const row of entities.rows.filter(row=>row.entity_type==='ASSIGNMENT')) await revokeQaAssignment({ actorUserId, assignmentId:String(row.entity_id), reason:REASON });
  for (const row of entities.rows.filter(row=>row.entity_type==='USER')) await deactivateQaIdentity({ actorUserId, userId:String(row.entity_id), reason:REASON });
  await pool.query(`update qa_fixture_sets set status='DEACTIVATED', deactivated_at=now(), updated_at=now() where id=$1`, [fixtureSetId]);
  return { fixtureSetId, fixtureCode: FIXTURE_CODE, status: 'DEACTIVATED', deactivatedUsers: entities.rows.filter(row=>row.entity_type==='USER').length };
};

const main = async () => {
  assertGuard();
  await migrateDatabase();
  const result = process.argv.includes('--deactivate') ? await deactivate() : await activate();
  console.log(JSON.stringify(result));
};

void main().catch(error => { console.error(error instanceof Error ? error.message : 'PRODUCTION_QA_FAILED'); process.exitCode=1; }).finally(closePool);
