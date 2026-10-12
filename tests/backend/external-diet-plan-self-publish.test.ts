import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildExternalDietFoodContext } from '../../backend/src/modules/external-clients/external-diet-plans.repository.js';
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { generateMealCombinations, MEAL_HEADS } from '../../backend/src/modules/nutrition/common-food-engine.js';

const migration=readFileSync(new URL('../../backend/src/db/migrations/0095_external_diet_plan_self_publish.sql',import.meta.url),'utf8');
const repository=readFileSync(new URL('../../backend/src/modules/external-clients/external-diet-plans.repository.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts',import.meta.url),'utf8');

test('external diet plans remain tenant/client scoped and versioned',()=>{assert.match(migration,/tenant_id uuid not null/);assert.match(migration,/foreign key \(client_id, tenant_id\)/);assert.match(migration,/unique \(plan_id, version\)/);assert.match(migration,/external_diet_plan_one_published_version/);});
test('authority excludes the frozen internal tenant and requires owner or consultant',()=>{assert.match(repository,/tenantType==='ZESTIVA_INTERNAL'/);assert.match(repository,/OWNER','CONSULTANT/);assert.match(repository,/CLIENT_INTAKE_REQUIRED/);});
test('generation reuses governed Common Food and enforces seven heads with five options',()=>{assert.match(repository,/commonFoodCatalogue/);assert.match(repository,/generateMealCombinations/);assert.match(repository,/MEAL_HEADS\.map/);assert.match(repository,/generated\.options\.length<5/);assert.match(repository,/count!==35/);});
test('Jain and legacy string intake values normalize deterministically',()=>{const context=buildExternalDietFoodContext({nutrition:{dietPreference:'VEGETARIAN',restrictions:['JAIN'],breakfast:'Poha',lunch:['Dal rice']},allergiesFamilyHistory:{foodAllergies:['PEANUT']}});assert.equal(context.diet,'VEGETARIAN');assert.deepEqual(context.preferences,['Poha','Dal rice']);assert.ok(context.avoids.includes('ONION'));assert.ok(context.avoids.includes('GARLIC'));assert.deepEqual(context.allergies,['PEANUT']);});
test('external publish path is direct and does not invoke Senior review',()=>{assert.match(routes,/diet-plan\/publish/);assert.match(repository,/status='PUBLISHED'/);assert.doesNotMatch(repository,/senior|reviewer|submitted_for_review/i);});

test('external generation returns real shared canonical foods and governed nutrition snapshots',()=>{
  const context=buildExternalDietFoodContext({nutrition:{dietPreference:'VEGETARIAN',restrictions:[],intolerances:[]},allergiesFamilyHistory:{foodAllergies:[]}});
  const ratios=[.06,.18,.08,.28,.1,.24,.06];
  const proteinRatios=[.04,.18,.08,.3,.1,.24,.06];
  const options=MEAL_HEADS.flatMap((mealHead,index)=>generateMealCombinations({
    foods:commonFoodCatalogue,
    context,
    mealHead,
    target:{kcal:2100*ratios[index],protein:120*proteinRatios[index],kcalTolerance:105,proteinTolerance:5},
    limit:5,
    semanticV1:true
  }).options);
  const sharedIds=new Set(commonFoodCatalogue.map(food=>food.id));
  assert.equal(options.length,35);
  assert.ok(options.every(option=>option.clientTitle&&option.clientTitle!=='Governed food option'));
  assert.ok(options.every(option=>option.components.length>0&&option.components.every(component=>sharedIds.has(component.foodId))));
  assert.ok(options.every(option=>option.nutrition.kcal!==null&&option.nutrition.kcal>0));
  assert.equal(options.filter(option=>option.components.some(component=>!sharedIds.has(component.foodId))).length,0);
});

test('external food context passes governed diet and safety exclusions into the shared generator',()=>{
  const context=buildExternalDietFoodContext({nutrition:{dietPreference:'VEGETARIAN',restrictions:['JAIN','NO_ONION_GARLIC'],intolerances:['DAIRY']},allergiesFamilyHistory:{foodAllergies:['PEANUTS']}});
  assert.equal(context.diet,'VEGETARIAN');
  assert.deepEqual(context.allergies,['PEANUTS']);
  assert.deepEqual(context.intolerances,['DAIRY']);
  for(const exclusion of ['JAIN','NO_ONION_GARLIC','ONION','GARLIC','ROOT_VEGETABLE'])assert.ok(context.avoids.includes(exclusion));
});
