import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildExternalDietFoodContext } from '../../backend/src/modules/external-clients/external-diet-plans.repository.js';

const migration=readFileSync(new URL('../../backend/src/db/migrations/0095_external_diet_plan_self_publish.sql',import.meta.url),'utf8');
const repository=readFileSync(new URL('../../backend/src/modules/external-clients/external-diet-plans.repository.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts',import.meta.url),'utf8');

test('external diet plans remain tenant/client scoped and versioned',()=>{assert.match(migration,/tenant_id uuid not null/);assert.match(migration,/foreign key \(client_id, tenant_id\)/);assert.match(migration,/unique \(plan_id, version\)/);assert.match(migration,/external_diet_plan_one_published_version/);});
test('authority excludes the frozen internal tenant and requires owner or consultant',()=>{assert.match(repository,/tenantType==='ZESTIVA_INTERNAL'/);assert.match(repository,/OWNER','CONSULTANT/);assert.match(repository,/CLIENT_INTAKE_REQUIRED/);});
test('generation reuses governed Common Food and enforces seven heads with five options',()=>{assert.match(repository,/commonFoodCatalogue/);assert.match(repository,/generateMealCombinations/);assert.match(repository,/MEAL_HEADS\.map/);assert.match(repository,/generated\.options\.length<5/);assert.match(repository,/count!==35/);});
test('Jain and legacy string intake values normalize deterministically',()=>{const context=buildExternalDietFoodContext({nutrition:{dietPreference:'VEGETARIAN',restrictions:['JAIN'],breakfast:'Poha',lunch:['Dal rice']},allergiesFamilyHistory:{foodAllergies:['PEANUT']}});assert.equal(context.diet,'VEGETARIAN');assert.deepEqual(context.preferences,['Poha','Dal rice']);assert.ok(context.avoids.includes('ONION'));assert.ok(context.avoids.includes('GARLIC'));assert.deepEqual(context.allergies,['PEANUT']);});
test('external publish path is direct and does not invoke Senior review',()=>{assert.match(routes,/diet-plan\/publish/);assert.match(repository,/status='PUBLISHED'/);assert.doesNotMatch(repository,/senior|reviewer|submitted_for_review/i);});
